<?php

namespace App\Http\Controllers;

use App\Models\Vacation;
use App\Models\User;
use Illuminate\Http\Request;
use Carbon\Carbon;


class VacationController extends Controller
{
    // Method to display the list of vacations
    public function index(Request $request){
        $data['getRecord'] = Vacation::getRecord($request); // Retrieving vacation data from the database
        return view('backend.vacations.index', $data);
    }

    // Method to show the add vacation form
    public function add(Request $request){
        $data['getUsers'] = User::get(); // Retrieving all users for the dropdown

        return view('backend.vacations.add', $data);
    }

    // Method to handle the submission of the add vacation form
    public function add_post(Request $request){
        // Validation logic before saving to the database
        $validatedData = $request->validate([
            'employee_id'    => 'required',
            'vacation_type'  => 'required',
            'start_date'     => 'required|date',
            'end_date'       => 'required|date|after_or_equal:start_date',
        ]);

        // Create a Carbon instance for start and end dates
        $startDate = Carbon::parse($request->start_date);
        $endDate = Carbon::parse($request->end_date);

        // Calculate the total number of days
        $totalDays = $endDate->diffInDays($startDate) + 1; // Adding 1 to include the start date

        // Creating and saving the vacation record
        $vacation                             = new Vacation();
        $vacation->employee_id                = trim($request->employee_id);
        $vacation->vacation_type              = trim($request->vacation_type);
        $vacation->start_date                 = $startDate;
        $vacation->end_date                   = $endDate;
        $vacation->total                      = $totalDays;

        $vacation->save();

        return redirect('admin/vacations')->with('success', 'Vacation successfully registered.');
    }

    // Method to delete a vacation record
    public function delete($id){
        $recordDelete = Vacation::find($id);
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
            return response()->json(['success' => false, 'message' => 'No vacations selected.']);
        }

        Vacation::whereIn('id', $ids)->delete();

        return response()->json(['success' => true, 'message' => 'Selected vacations deleted successfully.']);
    }



}
