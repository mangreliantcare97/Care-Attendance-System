<?php

namespace Database\Factories;

use App\Models\Job;
use Illuminate\Database\Eloquent\Factories\Factory;

class JobFactory extends Factory
{
    protected $model = Job::class;

    public function definition()
    {
        return [
            'job_title'     => $this->faker->jobTitle,
            'min_salary'    => $this->faker->numberBetween(3000, 6000),
            'max_salary'    => $this->faker->numberBetween(6000, 12000),
            'department_id' => $this->faker->numberBetween(1, 3), // Assuming you have 3 departments
        ];
    }
}

