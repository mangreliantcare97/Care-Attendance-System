<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Job;
use App\Models\Manager;
use App\Models\User;
use Illuminate\Http\Request;


class EmployeeeController extends Controller
{
public function index(Request $request){
    $data['getRecord'] = User::getRecord();    //for reterving employees data from database and retrive model logic
    return view('backend.employees.list',$data);

}

public function add(Request $request){

    $data['getJobs'] = Job::get();
    $data['getDepartments'] = Department::get();
    $data['getManagers'] = Manager::get();
    return view('backend.employees.add', $data);


}
public function add_post(Request $request){ //for validation logic ///// any post logic must put in it the validation before saving in data base

// dd($request->all());
    $user = request()->validate([

'name'             => 'required',
'email'            => 'required|unique:users',
'hire_date'        => 'required',
'job_id'           => 'required',
'salary'           => 'required',
// 'commission_pct'   => 'required',
'manager_id'       => 'required',
'department_id'    => 'required',

]);

$user                       = new User;
$user->name                 = trim ($request->name);
$user->email                = trim ($request->email);
$user->phone_number         = trim ($request->phone_number);
$user->hire_date            = trim ($request->hire_date);
$user->job_id               = trim ($request->job_id);
$user->salary               = trim ($request->salary);
// $user->commission_pct       = trim ($request->commission_pct);
$user->manager_id           = trim ($request->manager_id);
$user->department_id        = trim ($request->department_id);
$user->is_role              = 0; //0 - Employees
$user->save();

return redirect('admin/employees')->with('success', 'Employees successfully register.');
}


public function view($id){
    $data['getRecord'] = User::find($id);
    return view('backend.employees.view', $data);

}

public function edit($id){
    $data['getRecord'] = User::find($id);
    $data['getJobs'] = Job::get(); //for the link
    $data['getDepartments'] = Department::get();
    $data['getManagers'] = Manager::get();
    return view('backend.employees.edit', $data);

}

public function edit_update ($id, Request $request){


    $user = request()->validate([
        'email' => 'required|unique:users,email,'.$id
     ]);

    $user = User::find($id);

    $user->name                 = trim ($request->name);
    $user->email                = trim ($request->email);
    $user->phone_number         = trim ($request->phone_number);
    // $user->hire_date            = trim ($request->hire_date);
    $user->job_id               = trim ($request->job_id);
    $user->salary               = trim ($request->salary);
    // $user->commission_pct       = trim ($request->commission_pct);
    $user->manager_id           = trim ($request->manager_id);
    $user->department_id        = trim ($request->department_id);
    $user->is_role              = 0; //0 - Employees
    $user->save();

    return redirect('admin/employees')->with('success', 'Employees successfully update.');

}


public function delete($id){
    $recordDelete = User::find($id);
    $recordDelete->delete();
    return redirect()->back()->with('error', 'Record successfully deleted');

}

public function info(Request $request){
    $data['getRecord'] = User::getRecord();
    return view('backend.employees.info',$data);

}



}
