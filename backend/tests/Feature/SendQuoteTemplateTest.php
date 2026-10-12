<?php

namespace Tests\Feature;

use App\Models\TaskSet;
use App\Models\TaskTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** SENDQ (Send Quote) berada tepat setelah CREATEQ dan sebelum QRSLT (dokumen hal. 32). */
class SendQuoteTemplateTest extends TestCase
{
    use RefreshDatabase;

    public function test_sendq_sits_between_createq_and_qrslt(): void
    {
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $seq = fn (string $code) => TaskTemplate::where('task_set_id', $b2b->id)->where('code', $code)->value('seq');

        $this->assertNotNull($seq('SENDQ'));
        $this->assertGreaterThan($seq('CREATEQ'), $seq('SENDQ'));
        $this->assertLessThan($seq('QRSLT'), $seq('SENDQ'));
        $this->assertFalse((bool) TaskTemplate::where('code', 'SENDQ')->value('is_closing'));
    }
}