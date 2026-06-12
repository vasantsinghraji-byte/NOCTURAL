# Capacitor discovers plugins and bridge methods through annotations/reflection.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.PluginMethod class * { *; }
-keep class com.getcapacitor.** { *; }

# Preserve the native plugins used by the web bridge and background service.
-keep class com.nocturnal.healthcare.** { *; }
-keep class com.equimaps.capacitor_background_geolocation.** { *; }
-keep class com.aparajita.capacitor.** { *; }
