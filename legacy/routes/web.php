<?php

use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\ChartsController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\EmployeeeController;
use App\Http\Controllers\JobController;
use App\Http\Controllers\JobHistoryController;
use App\Http\Controllers\leaveController;
use App\Http\Controllers\ManagerController;
use App\Http\Controllers\MyAccountController;
use App\Http\Controllers\OverTimeController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\TodoController;
use App\Http\Controllers\VacationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/


Route::get('/', [AuthController::class, 'index'])->name('start') ;

Route::get('register', [AuthController::class, 'register'])->name('register');
Route::post('register', [AuthController::class, 'register_post'])->name('register_post');
Route::post('login_post', [AuthController::class, 'login_post'])->name('login_post');

//admin || HR same name
Route::group(['middleware' => 'admin'],function(){
    route::get('admin/dashboard', [DashboardController::class, 'dashboard'])->name('dashboard');


});


Route::get('logout', [AuthController::class, 'logout'])->name('logout');
route::get( 'admin/calendar', [CalendarController::class, 'index'])->name('calendar');
route::get(  'admin/charts', [ChartsController::class, 'index'])->name('charts');


route::get(  'admin/do', [TodoController::class, 'index'])->name('ToDo list');
Route::post('admin/do', [ToDoController::class, 'store'])->name('tasks.store');
Route::put('admin/do/{id}', [ToDoController::class, 'update'])->name('tasks.update');
Route::delete('admin/do/{id}', [ToDoController::class, 'destroy'])->name('tasks.destroy');
Route::delete('admin/do', [ToDoController::class, 'bulkDestroy'])->name('tasks.bulkDestroy');


//employees
route::get('admin/employees', [EmployeeeController::class, 'index'])->name('employees');
route::get('admin/employees/add', [EmployeeeController::class, 'add'])->name('employees_add');
route::post('admin/employees/add', [EmployeeeController::class, 'add_post'])->name('employees_add_post'); //post for save in database
route::get('admin/employees/view/{id}', [EmployeeeController::class, 'view'])->name('employees_view');
route::get('admin/employees/edit/{id}', [EmployeeeController::class, 'edit'])->name('employees_edit');
route::post('admin/employees/update/{id}', [EmployeeeController::class, 'edit_update'])->name('employees_update');
route::get('admin/employees/delete/{id}', [EmployeeeController::class, 'delete'])->name('employees_delete');

route::get('admin/employee_info', [EmployeeeController::class, 'info'])->name('employee_info');


// employees and department linked by job_title in employee by id after link it convert to string
// all edits of job title happend in employee
// edit in code of (update and add) and in code of (view)to convert id to name

//job   admin/jobs
route::get('admin/jobs', [JobController::class, 'index'])->name('jobs');
route::get('admin/jobs/add', [JobController::class, 'add'])->name('jobs_add');
route::post('admin/jobs/add', [JobController::class, 'add_post'])->name('jobs_add_post'); //post for save in database
route::get('admin/jobs/view/{id}', [JobController::class, 'view'])->name('jobs_view');
route::get('admin/jobs/edit/{id}', [JobController::class, 'edit'])->name('jobs_edit');
route::post('admin/jobs/update/{id}', [JobController::class, 'edit_update'])->name('jobs_update');
route::get('admin/jobs/delete/{id}', [JobController::class, 'delete'])->name('jobs_delete');
route::get('admin/jobs_export', [JobController::class, 'jobs_export'])->name('jobs_export');

route::get('admin/job_info', [JobController::class, 'info'])->name('job_info');

//job history  admin/job_history
route::get('admin/job_history', [JobHistoryController::class, 'index'])->name('job_history');
route::get('admin/job_history/add', [JobHistoryController::class, 'add'])->name('history_add');
route::post('admin/job_history/add', [JobHistoryController::class, 'add_post'])->name('history_add_post'); //post for save in database
route::get('admin/job_history/edit/{id}', [JobHistoryController::class, 'edit'])->name('history_edit');
route::post('admin/job_history/update/{id}', [JobHistoryController::class, 'edit_update'])->name('history_update');
route::get('admin/job_history/delete/{id}', [JobHistoryController::class, 'delete'])->name('history_delete');
route::get('admin/jobhistory_export', [JobHistoryController::class, 'jobs_export'])->name('history_export'); //34an roue bdl url

//my account   admin/my_account
route::get('admin/my_account', [MyAccountController::class, 'my_account'])->name('my_account'); //34an roue bdl url
route::post('admin/my_account/update', [MyAccountController::class, 'edit_update'])->name('edit_update');

//managers    admin/manager
route::get('admin/manager', [ManagerController::class, 'index'])->name('manager');
route::get('admin/manager/add', [ManagerController::class, 'add'])->name('manager_add');
route::post('admin/manager/add', [ManagerController::class, 'add_post'])->name('manager_add_post'); //post for save in database
route::get('admin/manager/view/{id}', [ManagerController::class, 'view'])->name('manager_view');
route::get('admin/manager/edit/{id}', [ManagerController::class, 'edit'])->name('manager_edit');
route::post('admin/manager/update/{id}', [ManagerController::class, 'edit_update'])->name('manager_update');
route::get('admin/manager/delete/{id}', [ManagerController::class, 'delete'])->name('manager_delete');

route::get('admin/manager_info', [ManagerController::class, 'info'])->name('manager_info');

//department   admin/department
route::get('admin/department', [DepartmentController::class, 'index'])->name('department');
route::get('admin/department/add', [DepartmentController::class, 'add'])->name('department_add');
route::post('admin/department/add', [DepartmentController::class, 'add_post'])->name('department_add_post'); //post for save in database
route::get('admin/department/view/{id}', [DepartmentController::class, 'view'])->name('department_view');
route::get('admin/department/edit/{id}', [DepartmentController::class, 'edit'])->name('department_edit');
route::post('admin/department/update/{id}', [DepartmentController::class, 'edit_update'])->name('department_update');
route::get('admin/department/delete/{id}', [DepartmentController::class, 'delete'])->name('department_delete');
route::get('admin/department_export', [DepartmentController::class, 'department_export'])->name('department_export');

route::get('admin/department_info', [DepartmentController::class, 'info'])->name('department_info');

//Attendance   admin/attendance
Route::get('admin/attendance', [AttendanceController::class, 'AttendanceEmployee'])->name('attendance.index');
Route::post('admin/attendance/save', [AttendanceController::class, 'AttendanceEmployeeSubmit'])->name('attendance.submit');
//its report
Route::get('admin/reports', [AttendanceController::class, 'index'])->name('report');
Route::get('admin/reports/export-pdf', [AttendanceController::class, 'exportPdf'])->name('reports.exportPdf');


//leaves and excuses   admin/leaves
route::get('admin/leaves', [leaveController::class, 'index'])->name('leaves');
route::get('admin/leaves/delete/{id}', [leaveController::class, 'delete'])->name('leaves_delete');
route::get('admin/leaves/add', [leaveController::class, 'add'])->name('leaves_add');
route::post('admin/leaves/add', [leaveController::class, 'add_post'])->name('leaves_add_post'); //post for save in database
Route::post('admin/leaves/delete-multiple', [leaveController::class, 'deleteMultiple']);


//vacations    admin/vacations
route::get('admin/vacations', [VacationController::class, 'index'])->name('vacations');
route::get('admin/vacations/delete/{id}', [VacationController::class, 'delete'])->name('vacations_delete');
route::get('admin/vacations/add', [VacationController::class, 'add'])->name('vacations_add');
route::post('admin/vacations/add', [VacationController::class, 'add_post'])->name('vacations_add_post'); //post for save in database
Route::post('admin/vacations/delete-multiple', [VacationController::class, 'deleteMultiple']);


//OverTime      admin/bounas
route::get('admin/bounas', [OverTimeController::class, 'index'])->name('bounas');
route::get('admin/bounas/delete/{id}', [OverTimeController::class, 'delete'])->name('bounas_delete');
route::get('admin/bounas/add', [OverTimeController::class, 'add'])->name('bounas_add');
route::post('admin/bounas/add', [OverTimeController::class, 'add_post'])->name('bounas_add_post'); //post for save in database
Route::post('admin/bounas/delete-multiple', [OverTimeController::class, 'deleteMultiple']);


//payrolls    admin/payroll
route::get('admin/payroll', [PayrollController::class, 'index'])->name('payroll');
route::get('admin/payroll/add', [PayrollController::class, 'add'])->name('payroll_add');
route::post('admin/payroll/add', [PayrollController::class, 'add_post'])->name('payroll_add_post'); //post for save in database
route::get('admin/payroll/edit/{id}', [PayrollController::class, 'edit'])->name('payroll_edit');
route::post('admin/payroll/update/{id}', [PayrollController::class, 'edit_update'])->name('payroll_update');
route::get('admin/payroll/delete/{id}', [PayrollController::class, 'delete'])->name('payroll_delete');
route::get('admin/payroll_export', [PayrollController::class, 'payrolls_export'])->name('payroll_export'); //34an route bdl url
Route::get('admin/payrolls/export-pdf', [PayrollController::class, 'exportPdf'])->name('payrolls.exportPdf');
Route::post('admin/payrolls/delete-multiple', [PayrollController::class, 'deleteMultiple']);






