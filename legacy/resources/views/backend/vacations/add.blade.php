@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/vacation.jpg') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 class="m-0">Vacation</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-right">
                            <li class="breadcrumb-item"><a href="#">Add</a></li>
                            <li class="breadcrumb-item active">Vacations</li>
                        </ol>
                    </div><!-- /.col -->
                </div><!-- /.row -->
            </div><!-- /.container-fluid -->
        </div>
        <!-- /.content-header -->

        <section class="content">
            <div class="container-fluid">
                <div class="row">
                    <div class="col-md-12">
                        <div class="card card-info">
                            <div class="card-header">
                                <h3 class="card-title"> Add Vacation </h3>
                            </div>
                            <form class="form-horizontal" method="post" action="{{ url('admin/vacations/add') }}"
                                enctype="multipart/form-data">
                                {{ csrf_field() }}
                                <div class="card-body">

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-label">Employee Name <span style="color: red;">*</span></label>
                                        <div class="col-sm-10">
                                            <select class="form-control" name="employee_id" required>
                                                <option value="">Select Employee Name</option>
                                                @foreach($getUsers as $value_users)
                                                <option value="{{ $value_users->id }}">{{ $value_users->name }}</option>
                                                @endforeach
                                            </select>
                                        </div>
                                    </div>

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-label">Vacation Type <span style="color: red;">*</span></label>
                                        <div class="col-sm-10">
                                            <select name="vacation_type" class="form-control" required>
                                                <option value="">Select Vacation Type</option>
                                                <option value="Annual">Annual Vacation</option>
                                                <option value="Sick">Sick Leave</option>
                                                <option value="Unpaid">Unpaid Leave</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-label">Start Date <span style="color: red;">*</span></label>
                                        <div class="col-sm-10">
                                            <input type="date" value="{{ old('start_date') }}" name="start_date" class="form-control" required>
                                        </div>
                                    </div>

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-label">End Date <span style="color: red;">*</span></label>
                                        <div class="col-sm-10">
                                            <input type="date" value="{{ old('end_date') }}" name="end_date" class="form-control" required>
                                        </div>
                                    </div>

                                </div>

                                <div class="card-footer">
                                    <a href="{{ url('admin/vacations') }}" class="btn btn-default float-left">Back</a>
                                    <button type="submit" class="btn btn-primary float-right">Submit</button>
                                </div>
                            </form>

                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
@endsection
