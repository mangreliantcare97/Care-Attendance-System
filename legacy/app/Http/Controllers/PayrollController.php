<?php
namespace App\Http\Controllers;
use App\Exports\PayrollExport;
use App\Models\Attendance;
use App\Models\Leave;
use App\Models\Payroll;
use App\Models\User;
use App\Models\Vacation;
use DB;
use Illuminate\Http\Request;
use Carbon\Carbon;
use Maatwebsite\Excel\Facades\Excel;
use Barryvdh\DomPDF\Facade\Pdf;



class PayrollController extends Controller
{
    public function index(Request $request){
        $data['getRecord'] = Payroll::getRecord();
        return view('backend.payrolls.index', $data);
    }


    public function add(Request $request){
        $data['getPayrolls'] = Payroll::get();
        $data['getEmployees'] = User::get();
        $employees = User::all(); // Retrieve all employees

        return view('backend.payrolls.create',$employees,$data);

    }


    public function add_post(Request $request)
    {
        $employee_ids = $request->input('employee_ids');
        $start_date = $request->input('start_date');
        $end_date = $request->input('end_date');


        foreach ($employee_ids as $employee_id) {
            $employee = User::find($employee_id);

            if (!$employee) {
                return redirect()->back()->with('error', 'Employee not found.');
            }

            $salary = $employee->salary;

            // Fetch attendance records for the employee within the date range
            $attendanceRecords = Attendance::where('employee_id', $employee_id)
                ->whereBetween('attendance_date', [$start_date, $end_date])
                ->get();

            $deductions = 0;
            $deductionRates = [
                1 => 0, // Present
                2 => 0.05, // Late
                3 => 0.1, // Absent
                4 => 0.025 // Half Day
            ];

            foreach ($attendanceRecords as $attendance) {
                $deductionRate = $deductionRates[$attendance->attendance_type] ?? 0;
                $deductions += $salary * $deductionRate;
            }

            // Calculate leaves within the date range
            $leaveRecords = Leave::where('employee_id', $employee_id)
                ->whereBetween('created_at', [$start_date, $end_date])
                ->get();
            foreach ($leaveRecords as $leave) {
                $deductions += $leave->leave_deduction;
            }



       //vacation logic
       $totalVacationDays = 25;
       $vacationDeductionRate = 200;
       // Calculate total vacation days used for the employee up to the end_date
        $totalUsedVacationDays = Vacation::where('employee_id', $employee_id)
        ->where('end_date', '<=', $end_date)
        ->sum('total');

    // Calculate remaining vacation days
    $rest_vacancy = $totalVacationDays - $totalUsedVacationDays;

    // Calculate the number of vacation days used within the payroll period
    $vacationDaysUsedInPeriod = Vacation::where('employee_id', $employee_id)
        ->whereBetween('start_date', [$start_date, $end_date])
        ->sum('total');


        // Check if vacation days exceed the limit of 25 days
if ($totalUsedVacationDays > $totalVacationDays) {
    // Calculate excess vacation days
    $excessVacationDays = $totalUsedVacationDays - $totalVacationDays;

    // Apply deduction for excess vacation days
    $deductions += $excessVacationDays * $vacationDeductionRate;
}




            // Calculate bounas within the date range
            $totalBonusHours = DB::table('times')
                ->where('employee_id', $employee_id)
                ->whereBetween('created_at', [$start_date, $end_date])
                ->sum('hours');
            $bounas = $totalBonusHours * 50;


            // Create the payroll record
            $payroll                        = new Payroll();
            $payroll->employee_id           = $employee_id;
            $payroll->start_date            = $start_date;
            $payroll->end_date              = $end_date;
            $payroll->basic_salary          = $salary;
            $payroll->bounas                = $bounas;
            $payroll->deductions            = $deductions ; // Include vacation deduction
            $payroll->taxes                 = $salary / 10; // Example tax calculation
            $payroll->rest_vacancy          = $rest_vacancy; // Updated vacation balance
            $payroll->net_pay               = $payroll->basic_salary - ($payroll->taxes + $payroll->deductions) + $payroll->bounas;

            $payroll->save();
        }

        return redirect('admin/payroll')->with('success', 'Payrolls successfully registered.');
    }



    public function edit($id)
{

    //all of these to show the name of employee at top of edit page
    $payroll = Payroll::find($id);



    // take the specific employee associated with this payroll
    $employee = User::find($payroll->employee_id);


    $data['getRecord'] = Payroll::find($id);
    $data['getEmployee'] = User::all();


    return view('backend.payrolls.edit',$data, [
        'getRecord' => $payroll,
        'employeeName' => $employee->name,
    ]);


}


public function edit_update ($id, Request $request){

    $payroll = Payroll::find($id);

    // $payroll                            = new payroll; de lma bt3ml add bs

    $payroll->basic_salary                 = trim ($request->basic_salary);
    $payroll->bounas                       = trim ($request->bounas);
    $payroll->deductions                   = trim ($request->deductions);
    $payroll->taxes                        = trim ($request->taxes);
    $payroll->rest_vacancy                 = trim ($request->rest_vacancy);
    $payroll->net_pay                      = trim ($request->net_pay);
    // $payroll->created_at                = trim ($request->created_at);
    $payroll->save();


    return redirect('admin/payroll')->with('success', 'successfully update.');
}




    // Method to delete a Payroll record
    public function delete($id){
        $recordDelete = Payroll::find($id);
        if ($recordDelete) {
            $recordDelete->delete();
            return redirect()->back()->with('success', 'Record successfully deleted.');
        } else {
            return redirect()->back()->with('error', 'Record not found.');
        }
    }

    public function deleteMultiple(Request $request)
    {
        $ids = $request->input('ids');

        if (!$ids) {
            return response()->json(['success' => false, 'message' => 'No Payroll selected.']);
        }

        Payroll::whereIn('id', $ids)->delete();

        return response()->json(['success' => true, 'message' => 'Selected Payroll deleted successfully.']);
    }



public function payrolls_export(Request $request)
{

    return Excel::download(new PayrollExport , 'payroll.xlsx');
}




    public function exportPdf(Request $request)
    {
        // Use the getRecord method from the Attendance model instead
        $getRecord = Payroll::getRecord();


        // Render the PDF-specific view and pass the filtered records
        $pdf = Pdf::loadView('backend.payrolls.pdf', compact('getRecord'));


        return $pdf->download('payroll-report.pdf');  // Return the the name of PDF for download
    }







}
