<?php

namespace Database\Factories;

use App\Models\Manager;
use Illuminate\Database\Eloquent\Factories\Factory;

class ManagerFactory extends Factory
{
    protected $model = Manager::class;

    public function definition()
    {
        return [
            'name'          => $this->faker->name,
            'email'         => $this->faker->unique()->safeEmail,
            'phone_number'  => $this->faker->phoneNumber,
            'hire_date'     => $this->faker->date('Y-m-d'),
            'salary'        => $this->faker->numberBetween(5000, 20000), // Random salary
            'commission_pct'=> $this->faker->randomFloat(2, 0, 0.5),


        ];
    }
}
