<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Job;
use App\Models\Manager;
use App\Models\Time;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;


class ChartsController extends Controller
{

    public function index(Request $request)
    {

        // Count of all employees, jobs, managers, and departments for cards
        $data['getEmployeeCount'] = User::count();
        $data['getJobsCount'] = Job::count();
        $data['getManagersCount'] = Manager::count();
        $data['getDepartmentCount'] = Department::count();







      // Get departments and employee count per department
      $departments = Department::withCount('users')->get();
      $data['departmentNames'] = $departments->pluck('department_name');
      $data['employeeCounts'] = $departments->pluck('users_count');

      // Get the start and end of the current month
      $startOfMonth = Carbon::now()->startOfMonth();
      $endOfMonth = Carbon::now()->endOfMonth();

      // Fetch employees and their overtime hours for the current month
      $overtimeData = Time::with('user')
          ->selectRaw('employee_id, SUM(hours) as total_hours')
          ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
          ->groupBy('employee_id')
          ->get();

      // Prepare data for chart: employee names and overtime hours
      $data['employeeNames'] = $overtimeData->map(function ($time) {
          return optional($time->user)->name ?? 'Unknown'; // Fallback to 'Unknown' if user is null
      })->toArray(); // Convert collection to array

      $data['overtimeHours'] = $overtimeData->pluck('total_hours')->toArray(); // Convert collection to array



        return view('backend.dashboard.charts', $data);
    }

}
