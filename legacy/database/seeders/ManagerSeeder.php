<?php

namespace Database\Seeders;

use App\Models\Manager;
use Illuminate\Database\Seeder;

class ManagerSeeder extends Seeder
{
    public function run()
    {
        // Generate 3 fake managers
        Manager::factory()->count(3)->create();
    }
}
