<?php

namespace Database\Seeders;

use App\Models\Department;
use Illuminate\Database\Seeder;

class DepartmentSeeder extends Seeder
{
    public function run()
    {
        // Generate 3 fake Departments
        Department::factory()->count(3)->create();
    }
}
