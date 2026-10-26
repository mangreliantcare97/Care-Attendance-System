<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Job;
use Illuminate\Http\Request;
use App\Exports\JobsExport;
use Maatwebsite\Excel\Facades\Excel;

class JobController extends Controller
{
    public function index(Request $request)
    {
        // Call the model's getRecord function, passing $request for search functionality.
        $getRecord = Job::getRecord($request);

        // Pass the data to the view using compact
        return view('backend.jobss.list', compact('getRecord'));
    }


    public function jobs_export(Request $request)
{

    return Excel::download(new JobsExport, 'jobs.xlsx');
}





    public function add(Request $request){
        $data['getDepartments'] = Department::get();
        return view('backend.jobss.add',$data);

    }
    public function add_post(Request $request){ //for validation logic ///// any post logic must put in it the validation before saving in data base

    // dd($request->all());
        $job = request()->validate([
    'job_title'             => 'required',
    'min_salary'            => 'required',
    'max_salary'            => 'required',
    'department_id'            => 'required',
    ]);

    $job                       = new Job;
    $job->job_title            = trim ($request->job_title);
    $job->min_salary           = trim ($request->min_salary);
    $job->max_salary           = trim ($request->max_salary);
    $job->department_id        = trim ($request->department_id);
    $job->save();

    return redirect('admin/jobs')->with('success', 'successfully register.');
    }


    public function view($id){
        $data['getRecord'] = Job::find($id);
        return view('backend.jobss.view', $data);

    }

    public function edit($id){
        $data['getRecord'] = Job::find($id);
        $data['getDepartments'] = Department::get();

        return view('backend.jobss.edit', $data);

    }

    public function edit_update ($id, Request $request){


    $job                       = Job::find($id);

    $job->job_title            = trim ($request->job_title);
    $job->min_salary           = trim ($request->min_salary);
    $job->max_salary           = trim ($request->max_salary);
    $job->department_id        = trim ($request->department_id);
    $job->save();

        return redirect('admin/jobs')->with('success', 'successfully update.');


    }


    public function delete($id){
        $recordDelete = Job::find($id);
        $recordDelete->delete();
        return redirect()->back()->with('error', 'Record successfully deleted');

    }

    public function info(Request $request){
        $data['getRecord'] = Job::getRecord($request);    //for reterving jobs data from database and retrive model logic

        return view('backend.jobss.info',$data);

    }









    }


