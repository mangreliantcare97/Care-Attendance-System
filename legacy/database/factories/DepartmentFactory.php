<?php

namespace Database\Factories;

use App\Models\Department;
use Illuminate\Database\Eloquent\Factories\Factory;

class DepartmentFactory extends Factory
{
    protected $model = Department::class;

    public function definition()
    {
        return [
            'department_name' => $this->faker->name,
            'manager_id'      => $this->faker->numberBetween(1, 3),
            'location'        => $this->faker->city,
        ];
    }
}
