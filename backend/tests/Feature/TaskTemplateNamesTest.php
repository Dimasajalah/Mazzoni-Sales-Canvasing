<?php

namespace Tests\Feature;

use App\Models\TaskTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Nama template yang tampil di Next Task mengikuti dokumen (hal. 26). */
class TaskTemplateNamesTest extends TestCase
{
    use RefreshDatabase;

    public function test_vrfksnoo_template_is_named_as_in_the_document(): void
    {
        $this->assertSame(
            'Verifikasi NOO melalui WhatsApp',
            TaskTemplate::where('code', 'VRFKSNOO')->value('name')
        );
    }
}