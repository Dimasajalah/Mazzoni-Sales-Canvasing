<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\ReturnRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Blueprint 5.2.18 (SL18 Return Customer), langkah 01: Adm. Return menginput pengajuan retur
 * dari customer dengan Dokumen 01 (Bukti Photo) — foto wajib ada di server, bukan hanya di UI.
 */
class ReturnPhotoRequiredTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: Customer, 1: Product} */
    private function fixtures(): array
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-RET-01', 'name' => 'PT Retur Foto', 'city' => 'Surabaya',
            'salesperson_id' => $user->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
        $product = Product::create([
            'part_num' => 'RET-1000', 'description' => 'Kecap Manis 600ml', 'uom' => 'PCS',
            'price' => 12000, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);

        return [$customer, $product];
    }

    public function test_submitting_a_return_without_any_photo_is_rejected(): void
    {
        [$c, $p] = $this->fixtures();

        $r = $this->postJson('/api/v1/returns', [
            'customer_id' => $c->id,
            'reason' => 'Rusak',
            'lines' => [['product_id' => $p->id, 'qty' => 1]],
        ]);

        $r->assertStatus(422);
        $r->assertJsonValidationErrors('attachments');
        $this->assertSame(0, ReturnRequest::count());
    }

    public function test_an_empty_attachments_array_is_still_rejected(): void
    {
        [$c, $p] = $this->fixtures();

        $r = $this->postJson('/api/v1/returns', [
            'customer_id' => $c->id,
            'reason' => 'Rusak',
            'lines' => [['product_id' => $p->id, 'qty' => 1]],
            'attachments' => [],
        ]);

        $r->assertStatus(422);
    }

    public function test_submitting_a_return_with_a_photo_is_accepted_and_stored(): void
    {
        [$c, $p] = $this->fixtures();

        $r = $this->post('/api/v1/returns', [
            'customer_id' => $c->id,
            'reason' => 'Rusak',
            'lines' => [['product_id' => $p->id, 'qty' => 1]],
            'attachments' => [UploadedFile::fake()->create('foto.jpg', 10, 'image/jpeg')],
        ]);

        $r->assertStatus(201);
        $return = ReturnRequest::with('attachments')->findOrFail($r->json('data.id'));
        $this->assertSame(1, $return->attachments->count());
        $this->assertSame('foto.jpg', $return->attachments->first()->filename);
    }
}