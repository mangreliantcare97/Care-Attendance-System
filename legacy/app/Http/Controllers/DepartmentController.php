<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Job;
use App\Models\Manager;
use App\Models\User;
use Illuminate\Http\Request;


class DepartmentController extends Controller
{
    public function index(Request $request)
{
    // Call the model's getRecord function, passing the $request for search functionality.
    $getRecord = Department::getRecord($request);

    // Pass the data to the view using compact
    return view('backend.departments.list', compact('getRecord'));
}

public function add(Request $request){
    //$data['getJobs'] = Job::get();
    $data['getManagers'] = Manager::get();

    return view('backend.departments.add',$data);

}
public function add_post(Request $request){         //for validation logic ///// any post logic must put in it the validation before saving in data base

// dd($request->all());
    $department = request()->validate([

'department_name'             => 'required',
'manager_id'                  => 'required',
'location'                    => 'required',



]);

$department                       = new Department;
$department->department_name      = trim ($request->department_name);
$department->manager_id           = trim ($request->manager_id);
$department->location             = trim ($request->location);

$department->save();

return redirect('admin/department')->with('success', 'Department successfully add.');
}


public function view($id){
    $data['getRecord'] = Department::find($id);
    return view('backend.departments.view', $data);

}

public function edit($id){
    $data['getRecord'] = Department::find($id);
    // $data['getJobs'] = Job::get(); //for the link
    $data['getManagers'] = Manager::get();
    return view('backend.departments.edit', $data);

}

public function edit_update ($id, Request $request){

    $department = Department::find($id);

// $department                    = new Department; de lma bt3ml add bs

$department->department_name      = trim ($request->department_name);
$department->manager_id           = trim ($request->manager_id);
$department->location             = trim ($request->location);

$department->save();

    return redirect('admin/department')->with('success', 'Department successfully update.');
}




public function delete($id){
    $recordDelete = Department::find($id);
    $recordDelete->delete();
    return redirect()->back()->with('error', 'Record successfully deleted');

}

public function info(Request $request){
    $data['getRecord'] = Department::getRecord($request);
    return view('backend.departments.info',$data);

}


}
