@extends('backend.layouts.app')

@section('content')
<div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/dashboard.jpg') }}'); background-size: cover; background-position: center;">
    <div class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <h1 class="m-0 text">Reminder</h1>
                </div>
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-right">
                        <li class="breadcrumb-item"><a href="#" class="text">Home</a></li>
                        <li class="breadcrumb-item active text">Reminder</li>
                    </ol>
                </div>
            </div>
        </div>
    </div>


    <!-- To Do List -->
    <div class="card">
        <div class="card-header">
            <h3 class="card-title">
                <i class="ion ion-clipboard mr-1"></i>
                To Do List
            </h3>
            <button type="button" class="btn btn-danger float-right ml-2" onclick="deleteSelected()">
                <i class="fas fa-trash"></i>
            </button>
        </div>


        <div class="card-body">
            <div class="mb-2">
                <input type="checkbox" id="selectAll" onclick="toggleSelectAll()"> Select All
            </div>
            <ul class="todo-list" data-widget="todo-list">
                @foreach($tasks as $task)
                    <li>

                        <div class="icheck-primary d-inline ml-2">
                            <input type="checkbox" class="taskCheckbox" id="todoCheck{{ $task->id }}" value="{{ $task->id }}">
                            <label for="todoCheck{{ $task->id }}"></label>
                        </div>
                        <span class="text" id="taskText{{ $task->id }}">{{ $task->task }}</span>

                        <div class="tools" style="float: right;">
                            <form action="{{ route('tasks.destroy', $task->id) }}" method="POST" style="display:inline;">
                                @csrf
                                @method('DELETE')
                                <button type="submit" style="border: none; background: none;">
                                    <i class="fas fa-trash-o"></i>
                                </button>
                            </form>

                            <form action="{{ route('tasks.update', $task->id) }}" method="POST" style="display:inline;" id="editForm{{ $task->id }}">
                                @csrf
                                @method('PUT')
                                <input type="text" name="task" value="{{ $task->task }}" style="display:none;" id="editInput{{ $task->id }}">
                                <button type="button" class="btn btn-warning btn-sm" onclick="editTask({{ $task->id }})"><i class="fas fa-edit"></i></button>
                            </form>
                        </div>
                    </li>
                @endforeach
            </ul>
        </div>


        <div class="card-footer clearfix">
            <form action="{{ route('tasks.store') }}" method="POST">
                @csrf
                <div class="input-group">
                    <input type="text" name="task" class="form-control" placeholder="Add new task...">
                    <span class="input-group-append">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Add item</button>
                    </span>
                </div>
            </form>
        </div>
    </div>
</div>


    <!-- Link to the new JavaScript file -->
<script src="{{ url('dist/js/todo.js') }}"></script>



@endsection
