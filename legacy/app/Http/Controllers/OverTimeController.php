<?php

namespace App\Http\Controllers;

use App\Models\Leave;
use App\Models\Time;
use App\Models\User;
use Illuminate\Http\Request;

class OverTimeController extends Controller
{
    public function index(Request $request){
        $data['getRecord'] = Time::getRecord($request);    //for reterving  the data from database and retrive model logic
        return view('backend.bounas.list',$data);

    }

    public function add(Request $request){
        $data['getUsers'] = User::get();
        return view('backend.bounas.add',$data);

    }
    public function add_post(Request $request){         //for validation logic ///// any post logic must put in it the validation before saving in data base

    // dd($request->all());
        $bounas = request()->validate([

    'employee_id'         => 'required',
    'hours'               => 'required',
    'created_at'          => 'required',

    ]);

    $bounas                          = new Time; // time da esm elmodel
    $bounas->employee_id             = trim ($request->employee_id);
    $bounas->hours                   = trim ($request->hours);
    $bounas->created_at              = trim ($request->created_at);

    $bounas->save();

    return redirect('admin/bounas')->with('success', ' successfully register.');
    }


    public function delete($id){
        $recordDelete = Time::find($id);
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
            return response()->json(['success' => false, 'message' => 'No Time selected.']);
        }

        Time::whereIn('id', $ids)->delete();

        return response()->json(['success' => true, 'message' => 'Selected Time deleted successfully.']);
    }

}
