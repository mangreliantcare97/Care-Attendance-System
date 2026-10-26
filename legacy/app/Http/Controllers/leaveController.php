<?php

namespace App\Http\Controllers;

use App\Models\Leave;
use App\Models\User;
use Illuminate\Http\Request;

class leaveController extends Controller
{
    public function index(Request $request){
        $data['getRecord'] = Leave::getRecord($request);    //for reterving  data from database and retrive model logic
        return view('backend.leaves.index',$data);

    }

    public function add(Request $request){
        $data['getUsers'] = User::get();
        return view('backend.leaves.add',$data);

    }
    public function add_post(Request $request){         //for validation logic ///// any post logic must put in it the validation before saving in data base

    // dd($request->all());
        $leave = request()->validate([

    'employee_id'         => 'required',
    'leave_type'          => 'required',
    'leave_deduction'     => 'required',
    'created_at'          => 'required',

    ]);

    $leave                          = new Leave;
    $leave->employee_id             = trim ($request->employee_id);
    $leave->leave_type              = trim ($request->leave_type);
    $leave->leave_deduction         = trim ($request->leave_deduction);
    $leave->created_at              = trim ($request->created_at);

    $leave->save();

    return redirect('admin/leaves')->with('success', ' successfully register.');
    }


 // Method to delete a Leave record
 public function delete($id){
    $recordDelete = Leave::find($id);
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
        return response()->json(['success' => false, 'message' => 'No Leave selected.']);
    }

    Leave::whereIn('id', $ids)->delete();

    return response()->json(['success' => true, 'message' => 'Selected Leave deleted successfully.']);
}

}
