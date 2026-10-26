<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class UserFactory extends Factory
{
    protected $model = User::class;

    public function definition()
    {
        return [
            'name'           => $this->faker->name,
            'email'          => $this->faker->unique()->safeEmail,
            'phone_number'   => $this->faker->phoneNumber,
            'hire_date'      => $this->faker->date('Y-m-d'),
            'job_id'         => $this->faker->numberBetween(1, 3),
            'salary'         => $this->faker->numberBetween(5000, 20000), // Random salary
            'manager_id'     => $this->faker->numberBetween(1, 3),
            'department_id'  => $this->faker->numberBetween(1, 3),

        ];
    }
}
