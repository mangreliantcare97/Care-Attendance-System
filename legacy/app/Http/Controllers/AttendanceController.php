<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Barryvdh\DomPDF\Facade\Pdf;


class AttendanceController extends Controller
{

    public function index(Request $request)
    {

        $data['getRecord'] = Attendance::getRecord(); //function getrecord el fl a5r de 3amlha static func fe model
        $data['header_title'] = "Attendance Report";
        return view('backend.attendance.report', $data);


    }



    public function AttendanceEmployee(Request $request){
        $data['header_title'] = "Employee Attendance";

        $data['getRecord'] = User::get();

        if(!empty($request->get('attendace_date')))
        {
            $date['getRecord'] = User::get($request->get('id'));
        }

        $data['header_title'] = "Employee Attendance";
        return view('backend.attendance.employee', $data);
    }


    public function AttendanceEmployeeSubmit(Request $request)
{
    $check_attendance = Attendance::ChechAlreadyAttendance($request->employee_id, $request->attendance_date);

    if(!empty($check_attendance)) {
        $attendance = $check_attendance;
    } else {
        $attendance                           = new Attendance;
        $attendance->employee_id              = $request->employee_id;
        $attendance->attendance_date          = $request->attendance_date;
        $attendance->created_by               = Auth::user()->id;
    }

    $attendance->attendance_type              = $request->attendance_type;
    $attendance->save();

    return response()->json(['message' => 'Attendance Successfully Saved']);
}



    public function exportPdf(Request $request)
    {
        // Use the getRecord method from the Attendance model instead
        $getRecord = Attendance::getRecord();


        // Render the PDF-specific view and pass the filtered records
        $pdf = Pdf::loadView('backend.attendance.pdf', compact('getRecord'));


        return $pdf->download('attendance-report.pdf');  // Return the the name of PDF for download
    }


}
