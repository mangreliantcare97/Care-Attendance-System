@extends('backend.layouts.app')

@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/generall.png') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 style="color: #333;">Managers</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6" style="text-align: right;">
                        <a href="{{ url('admin/manager/add') }}" class="btn btn-primary">Add Managers</a>
                    </div><!-- /.col -->
                </div><!-- /.row -->
            </div><!-- /.container-fluid -->
        </div>
        <!-- /.content-header -->



        <section class="content">
            <div class="container-fluid">
                <div class="row">
                    <section class="col-md-12">
                        <div class="card" style="background-color: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                            <div class="card-header">
                                <h3 class="card-title">Search Managers</h3>
                            </div>
                            <form method="get" action="">
                                <div class="card-body">
                                    <div class="row">
                                        <div class="form-group col-md-1">
                                            <label>ID</label>
                                            <input type="text" name="id" class="form-control" value="{{ Request()->id }}" placeholder="ID">
                                        </div>
                                        <div class="form-group col-md-2">
                                            <label>Manger Name</label>
                                            <input type="text" value="{{ Request()->name }}" name="name" class="form-control" placeholder="Name">
                                        </div>
                                        <div class="form-group col-md-3 d-flex align-items-end">
                                            <button class="btn btn-primary" type="submit" style="margin-right: 10px;">Search</button>
                                            <a href="{{ url('admin/manager') }}" class="btn btn-success">Reset</a>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>

                        @include('_message')

                        <div class="card" style="background-color: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                            <div class="card-header">
                                <h3 class="card-title">Managers List</h3>
                            </div>
                            <div class="card-body p-0">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Phone Number</th>
                                            <th>Hire Date</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($getRecord as $value)
                                        <tr>
                                            <td>{{ $value->name }}</td>
                                            <td>{{ $value->email }}</td>
                                            <td>{{ $value->phone_number }}</td>
                                            <td>{{ $value->hire_date }}</td>
                                            <td>
                                                <a href="{{ url('admin/manager/view/' .$value->id) }}" class="btn btn-info">View</a>
                                                <a href="{{ url('admin/manager/edit/' .$value->id) }}" class="btn btn-primary">Edit</a>
                                                <a href="{{ url('admin/manager/delete/' .$value->id) }}" onclick="return confirm('Are you sure you want to delete?')" class="btn btn-danger">Delete</a>
                                            </td>
                                        </tr>
                                        @empty
                                        <tr>
                                            <td colspan="5">Not Found..</td>
                                        </tr>
                                        @endforelse
                                    </tbody>
                                </table>

                                <div style="padding: 10px; float:right;">
                                    {!! $getRecord->appends(Illuminate\Support\Facades\Request::except('page'))->links() !!}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </section>
    </div>
@endsection
