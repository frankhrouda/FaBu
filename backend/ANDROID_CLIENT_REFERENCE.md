# Android Client Referenz (Kotlin)

Diese Referenz zeigt ein minimales, produktionsnahes Setup fuer einen Android-Client gegen die FaBu API.

Passend zur API-Doku: `backend/API.md`

## Ziel

- Einheitlicher API-Zugriff ueber Retrofit/OkHttp
- JWT-Token sicher speichern
- `Authorization: Bearer <token>` automatisch setzen
- Serverfehler (`401`, `403`, `409`, `429`, `500`) sauber behandeln

## 1) Abhaengigkeiten

`build.gradle.kts` (app):

```kotlin
dependencies {
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")

    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
```

## 2) Datenmodelle

```kotlin
data class UserDto(
    val id: Long,
    val name: String,
    val email: String,
    val role: String
)

data class AuthResponseDto(
    val token: String,
    val user: UserDto
)

data class ApiErrorDto(
    val error: String?
)
```

## 3) API Interface

```kotlin
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface FabuAuthApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponseDto

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponseDto
}

interface FabuVehiclesApi {
    @GET("vehicles")
    suspend fun getVehicles(): List<VehicleDto>
}

data class LoginRequest(val email: String, val password: String)
data class RegisterRequest(val name: String, val email: String, val password: String)

data class VehicleDto(
    val id: Long,
    val name: String,
    val license_plate: String,
    val type: String,
    val description: String,
    val active: Int
)
```

## 4) Sicheres Token Storage

```kotlin
import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class TokenStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "fabu_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun getToken(): String? = prefs.getString("fabu_token", null)

    fun setToken(token: String) {
        prefs.edit().putString("fabu_token", token).apply()
    }

    fun clearToken() {
        prefs.edit().remove("fabu_token").apply()
    }
}
```

## 5) Auth Interceptor

```kotlin
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val tokenProvider: () -> String?
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider()
        val request = chain.request().newBuilder().apply {
            header("Content-Type", "application/json")
            if (!token.isNullOrBlank()) {
                header("Authorization", "Bearer $token")
            }
        }.build()
        return chain.proceed(request)
    }
}
```

## 6) Retrofit Builder

```kotlin
import com.squareup.moshi.Moshi
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

fun createRetrofit(baseUrl: String, tokenStore: TokenStore): Retrofit {
    val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    val okHttp = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor { tokenStore.getToken() })
        .addInterceptor(logging)
        .build()

    val moshi = Moshi.Builder().build()

    return Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttp)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
}
```

Beispiel Base URL:
- Produktion: `https://fabu-online.de/api/`
- Lokal Emulator: `http://10.0.2.2:3001/api/`

## 7) Fehler-Mapping

```kotlin
import com.squareup.moshi.Moshi
import retrofit2.HttpException

sealed class ApiFailure {
    data object Unauthorized : ApiFailure()      // 401
    data object Forbidden : ApiFailure()         // 403
    data object Conflict : ApiFailure()          // 409
    data object TooManyRequests : ApiFailure()   // 429
    data class Server(val code: Int) : ApiFailure()
    data object Network : ApiFailure()
}

suspend fun <T> safeApiCall(
    moshi: Moshi,
    block: suspend () -> T
): Result<T> {
    return try {
        Result.success(block())
    } catch (e: HttpException) {
        val code = e.code()
        val mapped = when (code) {
            401 -> ApiFailure.Unauthorized
            403 -> ApiFailure.Forbidden
            409 -> ApiFailure.Conflict
            429 -> ApiFailure.TooManyRequests
            else -> ApiFailure.Server(code)
        }
        Result.failure(RuntimeException(mapped.toString()))
    } catch (_: Exception) {
        Result.failure(RuntimeException(ApiFailure.Network.toString()))
    }
}
```

Hinweis: Fuer produktive Apps ist ein eigener Error-Typ statt `RuntimeException` besser.

## 8) Login-Flow (Minimal)

1. `login(email, password)` aufrufen.
2. `token` aus `AuthResponseDto` in `TokenStore` speichern.
3. Folgerequests laufen automatisch mit `Authorization` Header.
4. Bei `401` Token loeschen und auf Login-Screen zuruecknavigieren.

## 9) Direkt abbildbare FaBu-Endpunkte

- `POST auth/login`
- `POST auth/register`
- `GET vehicles`
- `GET reservations`
- `GET reservations/availability`
- `POST reservations`
- `PATCH reservations/{id}/cancel`
- `PATCH reservations/{id}/complete`

Admin-only:
- `GET users`
- `PATCH users/{id}/role`
- `DELETE users/{id}`
- `POST vehicles`
- `PUT vehicles/{id}`
- `DELETE vehicles/{id}`
