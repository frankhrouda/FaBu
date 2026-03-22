package com.example.fabu.api

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.squareup.moshi.Moshi
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

// -----------------------------
// DTOs
// -----------------------------

data class UserDto(
    val id: Long,
    val name: String,
    val email: String,
    val role: String,
    val created_at: String? = null
)

data class AuthResponseDto(
    val token: String,
    val user: UserDto
)

data class ApiErrorDto(
    val error: String?
)

data class SuccessDto(
    val success: Boolean
)

data class VehicleDto(
    val id: Long,
    val name: String,
    val license_plate: String,
    val type: String,
    val description: String,
    val active: Int,
    val created_at: String? = null
)

data class ReservationDto(
    val id: Long,
    val user_id: Long,
    val vehicle_id: Long,
    val date: String,
    val time_from: String,
    val time_to: String,
    val reason: String,
    val km_driven: Int?,
    val destination: String?,
    val status: String,
    val created_at: String?,
    val user_name: String?,
    val user_email: String?,
    val vehicle_name: String?,
    val license_plate: String?
)

data class AvailabilityResponseDto(
    val available: Boolean
)

// -----------------------------
// Requests
// -----------------------------

data class LoginRequest(
    val email: String,
    val password: String
)

data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String
)

data class CreateVehicleRequest(
    val name: String,
    val license_plate: String,
    val type: String = "PKW",
    val description: String = ""
)

data class UpdateVehicleRequest(
    val name: String,
    val license_plate: String,
    val type: String = "PKW",
    val description: String = "",
    val active: Int = 1
)

data class CreateReservationRequest(
    val vehicle_id: Long,
    val date: String,
    val time_from: String,
    val time_to: String,
    val reason: String
)

data class CompleteReservationRequest(
    val km_driven: Int,
    val destination: String
)

data class UpdateUserRoleRequest(
    val role: String // "admin" | "user"
)

// -----------------------------
// Retrofit APIs
// Base path should end with /api/
// -----------------------------

interface AuthApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponseDto

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponseDto
}

interface VehiclesApi {
    @GET("vehicles")
    suspend fun getVehicles(): List<VehicleDto>

    @POST("vehicles")
    suspend fun createVehicle(@Body body: CreateVehicleRequest): VehicleDto

    @PUT("vehicles/{id}")
    suspend fun updateVehicle(
        @Path("id") id: Long,
        @Body body: UpdateVehicleRequest
    ): VehicleDto

    @DELETE("vehicles/{id}")
    suspend fun deleteVehicle(@Path("id") id: Long): SuccessDto
}

interface ReservationsApi {
    @GET("reservations")
    suspend fun getReservations(): List<ReservationDto>

    @GET("reservations/availability")
    suspend fun checkAvailability(
        @Query("vehicle_id") vehicleId: Long,
        @Query("date") date: String,
        @Query("time_from") timeFrom: String,
        @Query("time_to") timeTo: String,
        @Query("exclude_id") excludeId: Long? = null
    ): AvailabilityResponseDto

    @POST("reservations")
    suspend fun createReservation(@Body body: CreateReservationRequest): ReservationDto

    @PATCH("reservations/{id}/complete")
    suspend fun completeReservation(
        @Path("id") id: Long,
        @Body body: CompleteReservationRequest
    ): ReservationDto

    @PATCH("reservations/{id}/cancel")
    suspend fun cancelReservation(@Path("id") id: Long): SuccessDto

    @GET("reservations/vehicle/{vehicle_id}")
    suspend fun getReservationsByVehicle(
        @Path("vehicle_id") vehicleId: Long
    ): List<ReservationDto>
}

interface UsersApi {
    @GET("users")
    suspend fun getUsers(): List<UserDto>

    @PATCH("users/{id}/role")
    suspend fun updateRole(
        @Path("id") id: Long,
        @Body body: UpdateUserRoleRequest
    ): SuccessDto

    @DELETE("users/{id}")
    suspend fun deleteUser(@Path("id") id: Long): SuccessDto
}

// -----------------------------
// Token storage
// -----------------------------

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

object ApiFactory {
    // Example baseUrl:
    // Prod: https://fabu-online.de/api/
    // Android emulator local backend: http://10.0.2.2:3001/api/
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

    fun createAuthApi(retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)
    fun createVehiclesApi(retrofit: Retrofit): VehiclesApi = retrofit.create(VehiclesApi::class.java)
    fun createReservationsApi(retrofit: Retrofit): ReservationsApi = retrofit.create(ReservationsApi::class.java)
    fun createUsersApi(retrofit: Retrofit): UsersApi = retrofit.create(UsersApi::class.java)
}
