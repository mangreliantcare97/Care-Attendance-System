<?php

namespace App\Http\Controllers;

use App\Exports\JobhistoryExport;
use App\Models\Department;
use App\Models\History;
use App\Models\Job;
use Illuminate\Http\Request;
use App\Exports\JobsExport;
use Maatwebsite\Excel\Facades\Excel;

class JobHistoryController extends Controller
{
    public function index(Request $request){
        $data['getRecord'] = History::getRecord($request);    //for reterving job history data from database and retrive model logic
        return view('backend.job-history.list',$data);

    }

    public function jobs_export(Request $request){    //for export to excel sheet

        return Excel::download(new JobhistoryExport, 'history.xlsx');

    }


    public function add(Request $request){
        $data['getJobs'] = Job::get();
        $data['getDepartments'] = Department::get();

        return view('backend.job-history.add',$data);

    }
    public function add_post(Request $request){ //for validation logic ///// any post logic must put in it the validation before saving in data base

    // dd($request->all());
    $history = request()->validate([
    'employee_name'             => 'required',
    'start_date'                => 'required',
    'end_date'                  => 'required',
    'job_id'                    => 'required',
    'department_id'             => 'required'
    ]);

    $history                           = new History;
    $history->employee_name            = trim ($request->employee_name);
    $history->start_date               = trim ($request->start_date);
    $history->end_date                 = trim ($request->end_date);
    $history->job_id                   = trim ($request->job_id);
    $history->department_id            = trim ($request->department_id);
    $history->save();

        return redirect('admin/job_history')->with('success', 'successfully register.');
    }



    public function edit($id){
        $data['getRecord'] = History::find($id);
        $data['getJobs'] = Job::get();
        $data['getDepartments'] = Department::get();

        return view('backend.job-history.edit', $data);

    }

    public function edit_update ($id, Request $request){


        $history = History::find($id);

        $history->id                       = trim ($request->id);
        $history->employee_name            = trim ($request->employee_name);
        $history->start_date               = trim ($request->start_date);
        $history->end_date                 = trim ($request->end_date);
        $history->job_id                   = trim ($request->job_id);
        $history->department_id            = trim ($request->department_id);
        $history->save();

        return redirect('admin/job_history')->with('success', 'successfully update.');


    }


    public function delete($id){
        $recordDelete = History::find($id);
        $recordDelete->delete();
        return redirect()->back()->with('error', 'Record successfully deleted');

    }



    }


