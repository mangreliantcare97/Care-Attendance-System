<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Department;
use App\Models\Manager;
use App\Models\Task;
use App\Models\User;
use App\Models\Vacation;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;


class TodoController extends Controller
{


 // Show the to-do list
 public function index()
 {
     $tasks = Task::all();
     return view('backend.dashboard.ToDo', compact('tasks'));
 }

 // Add a new task
 public function store(Request $request)
 {
     $request->validate([
         'task' => 'required|string|max:255',
     ]);

     Task::create(['task' => $request->task]);

     return redirect()->route('tasks.store')->with('success', 'Task added successfully!');
 }

 // Delete a task
 public function destroy($id)
 {
     $task = Task::findOrFail($id);
     $task->delete();

     return redirect()->route('ToDo list')->with('success', 'Task deleted successfully!');
 }


 public function update(Request $request, $id)
 {
     $request->validate([
         'task' => 'required|string|max:255',
     ]);

     $task = Task::findOrFail($id);
     $task->update(['task' => $request->task]);

     return redirect()->route('ToDo list')->with('success', 'Task updated successfully!');
 }

 public function bulkDestroy(Request $request)
 {
     $taskIds = $request->input('task_ids');

     if ($taskIds) {
         Task::whereIn('id', $taskIds)->delete();
     }

     return redirect()->route('ToDo list')->with('success', 'Selected tasks deleted successfully!');
 }

 
}

