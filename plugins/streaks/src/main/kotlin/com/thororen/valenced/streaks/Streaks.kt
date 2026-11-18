@file:JvmName("Streaks")

package com.thororen.valenced.streaks

import app.valenced.bridge.asDelegate
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod

@Suppress("UNUSED")
val streaks = plugin {
    var hooks: StreakHooks? = null

    start {
        hooks = StreakHooks(dexFinder)

        registerNativeMethod("thororen.streaks.authors") { args ->
            val json by args.asDelegate().string()
            hooks?.putAuthors(json)
            null
        }

        registerNativeMethod("thororen.streaks.badges") { args ->
            val json by args.asDelegate().string()
            hooks?.setBadges(json)
            null
        }

        registerNativeMethod("thororen.streaks.clear") {
            hooks?.clear()
            null
        }
    }

    stop {
        hooks?.dispose()
        hooks = null
    }
}
