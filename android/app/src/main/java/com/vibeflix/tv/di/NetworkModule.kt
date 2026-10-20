package com.vibeflix.tv.di

import com.vibeflix.tv.BuildConfig
import com.vibeflix.tv.data.local.ServerConfigStore
import com.vibeflix.tv.data.remote.ServerUrlInterceptor
import com.vibeflix.tv.data.remote.VibeFlixApi
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideMoshi(): Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    @Provides
    @Singleton
    fun provideOkHttp(serverUrlInterceptor: ServerUrlInterceptor): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        return OkHttpClient.Builder()
            .addInterceptor(serverUrlInterceptor)
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /**
     * La URL base por defecto se fija en tiempo de compilación; las peticiones
     * son reescritas dinámicamente por [ServerUrlInterceptor] según la URL
     * guardada por el usuario en [ServerConfigStore].
     */
    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, moshi: Moshi): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.DEFAULT_SERVER_URL.trimEnd('/') + "/")
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    @Provides
    @Singleton
    fun provideApi(retrofit: Retrofit): VibeFlixApi = retrofit.create(VibeFlixApi::class.java)
}
