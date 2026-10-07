<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Revisi form Feedback Sample (poin 10, hasil meeting Okt 2026): Product Group, Qty (Gram),
 * Batch, Tempat Simpan. Keterangan wajib begitu hasilnya bukan "Interest" (ada yang Tidak Oke).
 */
class SampleFeedbackFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_requires_product_group_qty_and_batch(): void
    {
        $this->sales();

        $this->postJson('/api/v1/sample-feedbacks', ['feedback_type' => 'interest'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['product_group', 'qty', 'batch_number'])
            // revisi functional: "Tempat Simpan" dihilangkan dari form -> tidak lagi wajib
            ->assertJsonMissingValidationErrors(['storage_location']);
    }

    public function test_storage_location_is_optional_after_functional_revision(): void
    {
        $this->sales();

        $this->postJson('/api/v1/sample-feedbacks', [
            'product_group' => 'Saus Sambal', 'qty' => 100, 'batch_number' => 'B-9', 'feedback_type' => 'interest',
        ])->assertCreated()->assertJsonPath('data.feedback.storage_location', null);
    }

    public function test_interest_does_not_require_notes(): void
    {
        $this->sales();

        $this->postJson('/api/v1/sample-feedbacks', [
            'product_group' => 'Saus Tomat', 'qty' => 200, 'batch_number' => 'B-1',
            'storage_location' => 'Gudang A', 'feedback_type' => 'interest',
        ])->assertCreated();
    }

    public function test_not_interest_requires_notes(): void
    {
        $this->sales();

        $this->postJson('/api/v1/sample-feedbacks', [
            'product_group' => 'Saus Tomat', 'qty' => 200, 'batch_number' => 'B-1',
            'storage_location' => 'Gudang A', 'feedback_type' => 'not_interest',
        ])->assertStatus(422)->assertJsonValidationErrors('notes');
    }

    public function test_revision_requires_notes_and_revision_types(): void
    {
        $this->sales();

        $this->postJson('/api/v1/sample-feedbacks', [
            'product_group' => 'Saus Tomat', 'qty' => 200, 'batch_number' => 'B-1',
            'storage_location' => 'Gudang A', 'feedback_type' => 'revision',
        ])->assertStatus(422)->assertJsonValidationErrors(['notes', 'revision_types']);

        $this->postJson('/api/v1/sample-feedbacks', [
            'product_group' => 'Saus Tomat', 'qty' => 200, 'batch_number' => 'B-1',
            'storage_location' => 'Gudang A', 'feedback_type' => 'revision',
            'revision_types' => ['rasa', 'warna'], 'notes' => 'Kurang pedas dan warna pucat',
        ])->assertCreated()
            ->assertJsonPath('data.feedback.revision_types', ['rasa', 'warna'])
            ->assertJsonPath('data.feedback.storage_location', 'Gudang A')
            ->assertJsonPath('data.feedback.qty', 200);
    }

    public function test_version_sample_is_optional(): void
    {
        $this->sales();

        $res = $this->postJson('/api/v1/sample-feedbacks', [
            'product_group' => 'Saus Tomat', 'qty' => 200, 'batch_number' => 'B-1',
            'storage_location' => 'Gudang A', 'feedback_type' => 'interest',
        ])->assertCreated();

        $res->assertJsonPath('data.feedback.version_sample', null);
    }

    public function test_feedback_type_is_optional_for_the_new_form(): void
    {
        $this->sales();

        $this->postJson('/api/v1/sample-feedbacks', [
            'product_group' => 'Saus Tomat', 'qty' => 200, 'batch_number' => 'B-1',
        ])->assertCreated()->assertJsonPath('data.feedback.feedback_type', null);
    }

    public function test_revision_types_without_feedback_type_require_notes(): void
    {
        $this->sales();

        $payload = ['product_group' => 'Saus Tomat', 'qty' => 200, 'batch_number' => 'B-1', 'revision_types' => ['rasa', 'warna']];

        $this->postJson('/api/v1/sample-feedbacks', $payload)
            ->assertStatus(422)->assertJsonValidationErrors('notes');

        $this->postJson('/api/v1/sample-feedbacks', [...$payload, 'notes' => 'Kurang pedas'])
            ->assertCreated()->assertJsonPath('data.feedback.revision_types', ['rasa', 'warna']);
    }
}