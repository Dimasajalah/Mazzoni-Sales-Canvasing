<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 3 (hasil meeting Okt 2026): Customer Address dipecah jadi Alamat, Kota, Provinsi,
 * Kode Pos, Negara — plus Sumber Informasi Pertama (lead_source).
 */
class LeadAddressFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_store_accepts_split_address_fields_and_defaults_country(): void
    {
        $this->sales();

        $res = $this->postJson('/api/v1/leads', [
            'business_name' => 'UD Alamat Uji',
            'address' => 'Jl. Merdeka No. 1',
            'city' => 'Surabaya',
            'province' => 'Jawa Timur',
            'postal_code' => '60111',
            'lead_source' => 'Referensi teman',
        ])->assertCreated();

        $res->assertJsonPath('data.address', 'Jl. Merdeka No. 1')
            ->assertJsonPath('data.city', 'Surabaya')
            ->assertJsonPath('data.province', 'Jawa Timur')
            ->assertJsonPath('data.postal_code', '60111')
            ->assertJsonPath('data.country', 'Indonesia') // default
            ->assertJsonPath('data.lead_source', 'Referensi teman');
    }

    public function test_country_can_be_overridden(): void
    {
        $this->sales();

        $this->postJson('/api/v1/leads', [
            'business_name' => 'UD Luar Negeri', 'country' => 'Singapore',
        ])->assertCreated()->assertJsonPath('data.country', 'Singapore');
    }

    public function test_update_accepts_split_address_fields(): void
    {
        $this->sales();
        $id = $this->postJson('/api/v1/leads', ['business_name' => 'UD Update Alamat'])->json('data.id');

        $this->patchJson("/api/v1/leads/{$id}", [
            'city' => 'Malang', 'province' => 'Jawa Timur', 'postal_code' => '65111',
        ])->assertOk()
            ->assertJsonPath('data.city', 'Malang')
            ->assertJsonPath('data.province', 'Jawa Timur')
            ->assertJsonPath('data.postal_code', '65111');
    }
}