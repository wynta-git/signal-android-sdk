# Signal Android SDK — library ProGuard/R8 rules.
# Applied to the SDK's own release build now that isMinifyEnabled = true.
# Keeps the public API stable and readable for consumers; everything else
# (services/, store/, internal utils) is free to be renamed/inlined/stripped.

-keep class com.signalsdk.SignalSDK { *; }
-keep class com.signalsdk.config.** { *; }
-keep class com.signalsdk.models.** { *; }
-keep class com.signalsdk.utils.ApiLogEntry { *; }

# javac/kotlinc target Java 17, which can emit invokedynamic-based string concatenation
# (java.lang.invoke.StringConcatFactory). D8 desugars this before it reaches the device;
# R8 just can't verify the class exists on minSdk 21's core library. Safe to silence.
-dontwarn java.lang.invoke.StringConcatFactory
