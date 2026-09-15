<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_success_returns_token(): void
    {
        User::factory()->create([
            'email' => 'budi@bmt.local',
            'username' => 'budi',
            'password' => 'password',
            'role' => 'sales',
            'active' => true,
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'login' => 'budi@bmt.local',
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => ['token', 'user']]);
    }

    public function test_login_rejects_invalid_credentials(): void
    {
        User::factory()->create([
            'email' => 'budi@bmt.local',
            'username' => 'budi',
            'password' => 'password',
            'active' => true,
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'login' => 'budi@bmt.local',
            'password' => 'wrong',
        ]);

        $response->assertStatus(422)->assertJsonPath('success', false);
    }
}
