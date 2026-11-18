package com.thororen.valenced.streaks

import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.DynamicDrawableSpan
import android.text.style.ForegroundColorSpan
import android.text.style.ImageSpan
import android.text.style.StyleSpan
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import app.valenced.xposed.api.DexFinder
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import org.json.JSONObject
import java.util.WeakHashMap

private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"
private const val MESSAGE = "com.discord.chat.bridge.Message"
private const val CHAT_LIST_VIEW_MANAGER = "com.discord.chat.presentation.list.ChatListViewManager"

// React Native's resource name for assets/design/components/Icon/native/redesign/generated/images/FireIcon.png
private const val FIRE_ICON = "design_components_icon_native_redesign_generated_images_fireicon"

private const val CACHE_CAPACITY = 2000

internal class StreakHooks(dexFinder: DexFinder) {
    private data class Badge(val count: Int, val color: Int)
    private class Bound(val messageId: String, val base: CharSequence, var rendered: CharSequence, var shown: Badge?)

    private val authors = object : LinkedHashMap<String, String>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>) = size > CACHE_CAPACITY
    }

    @Volatile
    private var badges: Map<String, Badge> = emptyMap()

    // Main thread only
    private val names = WeakHashMap<TextView, Bound>()
    private var ids: ViewIds? = null
    private var fireIconId: Int? = null
    private val iconAlignment = if (Build.VERSION.SDK_INT >= 29) DynamicDrawableSpan.ALIGN_CENTER else DynamicDrawableSpan.ALIGN_BASELINE

    private val mainHandler = Handler(Looper.getMainLooper())

    private val messageIdField = dexFinder.classLoader.loadClass(MESSAGE).getDeclaredField("id")
        .apply { isAccessible = true }

    private val chatListView: Class<*> = dexFinder.classLoader.loadClass(CHAT_LIST_VIEW_MANAGER).declaredMethods
        .single { it.name == "setFloatingChatInputEnabled" && !it.isBridge }
        .parameterTypes[0]

    private val unhooks: List<XC_MethodHook.Unhook>

    init {
        val setMessage = dexFinder.findMethod {
            matcher {
                declaredClass(MESSAGE_VIEW)
                usingEqStrings("message", "messageContext", "eventHandler")
            }
        } ?: error("MessageView.setMessage not found")

        unhooks = listOf(XposedBridge.hookMethod(setMessage, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                val view = param.thisObject as ViewGroup
                val id = messageIdField.get(param.args[0]) as String
                val ids = ids ?: ViewIds(view).also { ids = it }
                val header = view.childWithId(ids.header) ?: return
                val name = header.findViewById<View>(ids.authorName) as? TextView ?: return

                // Discord may skip setting the same text again, which would still have the streak
                val current = name.text
                val bound = names[name]?.takeIf { it.rendered.toString() == current.toString() }
                    ?.let { Bound(id, it.base, current, it.shown) }
                    ?: Bound(id, current, current, null)
                names[name] = bound
                render(name, bound)
            }
        }))
    }

    private class ViewIds(view: View) {
        val header = view.idOf("header")
        val authorName = view.idOf("author_name")
    }

    fun putAuthors(json: String) {
        val obj = JSONObject(json)
        synchronized(authors) {
            for (key in obj.keys()) authors[key] = obj.getString(key)
        }
        mainHandler.post { renderAll() }
    }

    fun setBadges(json: String) {
        val obj = JSONObject(json)
        badges = obj.keys().asSequence().associateWith {
            val badge = obj.getJSONArray(it)
            Badge(badge.getInt(0), badge.getInt(1))
        }
        mainHandler.post { renderAll() }
    }

    fun clear() {
        badges = emptyMap()
        mainHandler.post { renderAll() }
    }

    fun dispose() {
        for (unhook in unhooks) unhook.unhook()
        badges = emptyMap()
        synchronized(authors) { authors.clear() }
        mainHandler.post {
            renderAll()
            names.clear()
        }
    }

    private fun renderAll() {
        var list: View? = null
        for ((name, bound) in names) {
            if (render(name, bound)) {
                name.requestLayout()
                list = list ?: chatList(name)
            }
        }
        list?.measureAndLayout()
    }

    private fun render(name: TextView, bound: Bound): Boolean {
        val userId = synchronized(authors) { authors[bound.messageId] }
        val badge = userId?.let { badges[it] }
        if (badge == bound.shown) return false

        val text = if (badge == null) bound.base else SpannableStringBuilder(bound.base).apply {
            append(' ')
            val icon = fireIcon(name)
            if (icon != null) {
                val size = name.textSize.toInt()
                icon.setBounds(0, 0, size, size)
                icon.setTint(badge.color)
                append('￼')
                setSpan(ImageSpan(icon, iconAlignment), length - 1, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            } else append("🔥")
            val start = length
            append(badge.count.toString())
            setSpan(ForegroundColorSpan(badge.color), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(StyleSpan(Typeface.BOLD), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }

        val changed = text.toString() != bound.rendered.toString()
        name.text = text
        bound.rendered = text
        bound.shown = badge
        return changed
    }

    @Suppress("DiscouragedApi")
    private fun fireIcon(view: View): Drawable? {
        val id = fireIconId ?: view.resources.getIdentifier(FIRE_ICON, "drawable", view.context.packageName)
            .also { fireIconId = it }
        return if (id == 0) null else view.context.getDrawable(id)?.mutate()
    }

    private fun chatList(view: View) =
        generateSequence(view.parent) { it.parent }.firstOrNull(chatListView::isInstance) as View?
}

@Suppress("DiscouragedApi")
private fun View.idOf(name: String) = resources.getIdentifier(name, "id", context.packageName)

// Not findViewById, as nested messages (such as replies) have views with the same IDs
private fun ViewGroup.childWithId(id: Int): View? =
    (0 until childCount).asSequence().map(::getChildAt).firstOrNull { it.id == id }

// React Native ignores layout requests from native views
private fun View.measureAndLayout() {
    measure(
        View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY),
    )
    layout(left, top, right, bottom)
}
