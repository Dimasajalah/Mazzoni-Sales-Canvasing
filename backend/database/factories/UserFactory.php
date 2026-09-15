<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        $username = fake()->unique()->userName();

        return [
            'employee_id' => 'EMP-'.fake()->unique()->numerify('####'),
            'salesperson_code' => 'SP-'.fake()->unique()->numerify('###'),
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'username' => $username,
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => 'sales',
            'territory' => 'Surabaya',
            'active' => true,
            'remember_token' => Str::random(10),
        ];
    }

    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
