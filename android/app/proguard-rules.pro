# Vibe Flix TV - reglas de ofuscacion (build release).

# DTOs serializados con Moshi (reflexion sobre los nombres de propiedad).
-keep class com.vibeflix.tv.data.remote.dto.** { *; }
-keepclassmembers class com.vibeflix.tv.data.remote.dto.** { *; }
-keepclassmembers class ** {
    @com.squareup.moshi.Json <fields>;
}
-keepattributes Signature
-keepattributes RuntimeVisibleAnnotations
-keepattributes AnnotationDefault
-keep class kotlin.Metadata { *; }

-dontwarn javax.annotation.**
-dontwarn okhttp3.**
-dontwarn okio.**
