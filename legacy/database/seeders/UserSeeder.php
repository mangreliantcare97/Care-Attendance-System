<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    public function run()
    {
        // Generate 3 fake Employees
        User::factory()->count(3)->create([
            'is_role' => 0,  // Set is_role field to 0
        ]);
    }
}
