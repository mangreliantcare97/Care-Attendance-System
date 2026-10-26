<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Department;
use App\Models\Manager;
use App\Models\User;
use App\Models\Vacation;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;


class DashboardController extends Controller
{

public function dashboard(Request $request){   //for calendar and cards

    //cards logic
    $currentDate = now()->format('Y-m-d');

   //gets for card num
   $data['getEmployeeCount'] = User::count();


   // Attendance counts for today
   $data['presentCount'] = Attendance::where('attendance_date', $currentDate)
                                      ->where('attendance_type', 1) // because 1 is for Present
                                      ->count();
   $data['lateCount'] = Attendance::where('attendance_date', $currentDate)
                                      ->where('attendance_type', 2) // because 2 is for Late
                                      ->count();

   $data['absentCount'] = Attendance::where('attendance_date', $currentDate)
                                      ->where('attendance_type', 3) // because 3 is for Absent
                                      ->count();

   $data['halfdayCount'] = Attendance::where('attendance_date', $currentDate)
                                      ->where('attendance_type', 4) // because 4 is for half
                                      ->count();




    // Fetch monthly data for the chart
    $year = now()->year;
    $months = range(1, 12);
    $vacations = [];
    $absences = [];

    foreach ($months as $month) {
        $vacations[] = Vacation::whereYear('start_date', $year)
                                ->whereMonth('start_date', $month)
                                ->distinct('employee_id') // Ensure counting only unique employees
                                ->count('employee_id'); // Count number of employees who took vacation

        $absences[] = Attendance::whereYear('attendance_date', $year)
                                ->whereMonth('attendance_date', $month)
                                ->where('attendance_type', 3) // Absent
                                ->count();

        $Present[] = Attendance::whereYear('attendance_date', $year)
                                ->whereMonth('attendance_date', $month)
                                ->where('attendance_type', 1) // present
                                ->count()/4;
    }

    $data['vacations'] = $vacations;
    $data['absences'] = $absences;
    $data['Present'] = $Present;

   return view('backend.dashboard.list', $data);

}

}
