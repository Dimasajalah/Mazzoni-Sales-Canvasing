<?php

namespace Tests\Feature;

use App\Models\TaskSet;
use App\Models\TaskTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Kode task template B2B mengikuti dokumen (hal. 26 dan 28). */
class TaskTemplateCodesTest extends TestCase
{
    use RefreshDatabase;

    public function test_b2b_sample_template_carries_the_first_revision_code(): void
    {
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();

        $this->assertSame(
            'GIVESMPL1',
            TaskTemplate::where('task_set_id', $b2b->id)->where('pipeline_step', 'sampling')->value('code')
        );
    }
}