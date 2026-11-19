# Reglas R8 / ProGuard para Bioboros (Capacitor 8 + Credential Manager + Firebase)
# Conserva SourceFile/LineNumberTable para que Google Play desofusque stack traces
# usando el mapping.txt empaquetado automáticamente en el .aab.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Clases nativas propias de Bioboros y plugins locales de Capacitor
-keep class com.bioboros.app.MainActivity { *; }
-keep class com.bioboros.app.MfGoogleId { *; }
-keep class com.bioboros.app.MfSilencioVoz { *; }

# Capacitor: plugins anotados, métodos puente y puentes JS del WebView
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.getcapacitor.BridgeActivity { *; }
-keep class com.getcapacitor.PluginLoadException { *; }
-keep class com.getcapacitor.plugin.** { *; }

# Plugins nativos de terceros (Capgo / Capacitor community / Firebase)
-keep class ee.forgr.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.getcapacitor.community.** { *; }

# Credential Manager & Google Identity (reflexión interna de proveedores)
-keep class androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
