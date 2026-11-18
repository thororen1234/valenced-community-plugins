package com.thororen.valenced.streaks

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import app.valenced.xposed.api.DexFinder
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import org.json.JSONObject
import java.lang.reflect.Modifier
import java.util.WeakHashMap

private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"
private const val MESSAGE = "com.discord.chat.bridge.Message"
private const val CHAT_LIST_VIEW_MANAGER = "com.discord.chat.presentation.list.ChatListViewManager"

// React Native's resource name for assets/design/components/Icon/native/redesign/generated/images/FireIcon.png
private const val FIRE_ICON = "design_components_icon_native_redesign_generated_images_fireicon"

private const val CACHE_CAPACITY = 2000
private const val GAP_DP = 4f

internal class StreakHooks(dexFinder: DexFinder) {
    private data class Badge(val count: Int, val color: Int)

    private class Slot(val roleIcon: View, val wrapper: LinearLayout, val badge: ImageView, val name: TextView) {
        var messageId: String? = null
        var shown: Badge? = null
    }

    private val authors = object : LinkedHashMap<String, String>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>) = size > CACHE_CAPACITY
    }

    @Volatile
    private var badges: Map<String, Badge> = emptyMap()

    // Main thread only
    private val slots = WeakHashMap<ViewGroup, Slot>()
    private var ids: ViewIds? = null
    private var fireIconId: Int? = null
    private var countTypeface: Typeface? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    private val messageIdField = dexFinder.classLoader.loadClass(MESSAGE).getDeclaredField("id")
        .apply { isAccessible = true }

    private val chatListView: Class<*> = dexFinder.classLoader.loadClass(CHAT_LIST_VIEW_MANAGER).declaredMethods
        .single { it.name == "setFloatingChatInputEnabled" && !it.isBridge }
        .parameterTypes[0]

    private val discordFont = runCatching {
        val font = dexFinder.findClass {
            matcher {
                superClass("java.lang.Enum")
                usingEqStrings("PrimaryMedium")
            }
        }!!
        val setFont = dexFinder.findMethod {
            matcher {
                modifiers(Modifier.STATIC)
                paramTypes("android.widget.TextView", font.name)
            }
        }!!
        val constants = font.enumConstants!!.associateBy { (it as Enum<*>).name }
        setFont to (constants["PrimarySemibold"] ?: constants.getValue("PrimaryMedium"))
    }.getOrNull()

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
                val ids = ids ?: ViewIds(view).also { ids = it }
                val slot = slots[view] ?: run {
                    val header = view.childWithId(ids.header) ?: return
                    val roleIcon = header.findViewById<View>(ids.roleIcon) ?: return
                    val name = header.findViewById<View>(ids.authorName) as? TextView ?: return
                    insertSlot(roleIcon, name)?.also { slots[view] = it } ?: return
                }

                slot.messageId = messageIdField.get(param.args[0]) as String
                render(slot)
            }
        }))
    }

    private class ViewIds(view: View) {
        val header = view.idOf("header")
        val authorName = view.idOf("author_name")
        val roleIcon = view.idOf("role_icon")
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
            var list: View? = null
            for (slot in slots.values) {
                list = list ?: chatList(slot.wrapper)
                removeSlot(slot)
            }
            slots.clear()
            list?.measureAndLayout()
        }
    }

    // The header is a ConstraintLayout chain with R8-renamed params, so the wrapper takes the role icon's ID and params
    private fun insertSlot(roleIcon: View, name: TextView): Slot? {
        val parent = roleIcon.parent as? ViewGroup ?: return null
        val index = parent.indexOfChild(roleIcon)
        val params = roleIcon.layoutParams
        val context = roleIcon.context

        val badge = ImageView(context).apply {
            scaleType = ImageView.ScaleType.CENTER
            visibility = View.GONE
        }
        val wrapper = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        parent.removeViewAt(index)
        wrapper.id = roleIcon.id
        roleIcon.id = View.NO_ID
        wrapper.addView(roleIcon, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        wrapper.addView(badge, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        parent.addView(wrapper, index, params)

        return Slot(roleIcon, wrapper, badge, name)
    }

    private fun removeSlot(slot: Slot) {
        val parent = slot.wrapper.parent as? ViewGroup ?: return
        val index = parent.indexOfChild(slot.wrapper)
        val params = slot.wrapper.layoutParams

        slot.wrapper.removeAllViews()
        parent.removeViewAt(index)
        slot.roleIcon.id = slot.wrapper.id
        parent.addView(slot.roleIcon, index, params)
    }

    private fun renderAll() {
        var list: View? = null
        for (slot in slots.values) {
            if (render(slot)) {
                slot.wrapper.requestLayout()
                list = list ?: chatList(slot.wrapper)
            }
        }
        list?.measureAndLayout()
    }

    private fun render(slot: Slot): Boolean {
        val userId = slot.messageId?.let { synchronized(authors) { authors[it] } }
        val badge = userId?.let { badges[it] }
        val roleShown = slot.roleIcon.visibility == View.VISIBLE

        if (badge != slot.shown)
            slot.badge.setImageDrawable(badge?.let { BadgeDrawable(fireIcon(slot.name), it, slot.name.textSize, countTypeface(slot.name)) })
        slot.badge.visibility = if (badge != null) View.VISIBLE else View.GONE

        val params = slot.badge.layoutParams as LinearLayout.LayoutParams
        val margin = if (roleShown) (GAP_DP * slot.badge.resources.displayMetrics.density).toInt() else 0
        if (params.marginStart != margin) {
            params.marginStart = margin
            slot.badge.layoutParams = params
        }
        slot.wrapper.visibility = if (roleShown || badge != null) View.VISIBLE else View.GONE

        val changed = (badge == null) != (slot.shown == null) || badge?.count != slot.shown?.count
        slot.shown = badge
        return changed
    }

    @Suppress("DiscouragedApi")
    private fun fireIcon(view: View): Drawable? {
        val id = fireIconId ?: view.resources.getIdentifier(FIRE_ICON, "drawable", view.context.packageName)
            .also { fireIconId = it }
        return if (id == 0) null else view.context.getDrawable(id)?.mutate()
    }

    private fun countTypeface(view: TextView): Typeface =
        countTypeface ?: (discordFont?.let { (setFont, font) ->
            runCatching { TextView(view.context).also { setFont.invoke(null, it, font) }.typeface }.getOrNull()
        } ?: Typeface.DEFAULT_BOLD).also { countTypeface = it }

    private class BadgeDrawable(private val icon: Drawable?, badge: Badge, size: Float, typeface: Typeface) : Drawable() {
        private val text = if (icon == null) "🔥${badge.count}" else badge.count.toString()
        private val iconSize = size.toInt()
        private val gap = (size / 8).toInt()
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = badge.color
            textSize = size
            this.typeface = typeface
        }
        private val width = (if (icon != null) iconSize + gap else 0) + paint.measureText(text).toInt()

        init {
            icon?.setBounds(0, 0, iconSize, iconSize)
            icon?.setTint(badge.color)
            setBounds(0, 0, width, iconSize)
        }

        override fun getIntrinsicWidth() = width

        override fun getIntrinsicHeight() = iconSize

        override fun draw(canvas: Canvas) {
            canvas.save()
            canvas.translate(bounds.left.toFloat(), bounds.top.toFloat())
            icon?.draw(canvas)
            val x = if (icon != null) (iconSize + gap).toFloat() else 0f
            val y = iconSize / 2f - (paint.ascent() + paint.descent()) / 2
            canvas.drawText(text, x, y, paint)
            canvas.restore()
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = alpha
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
        }

        @Deprecated("Deprecated in Java")
        override fun getOpacity() = PixelFormat.TRANSLUCENT
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
