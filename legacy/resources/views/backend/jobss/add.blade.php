@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/generall.png') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 class="m-0">Jobs</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-right">
                            <li class="breadcrumb-item"><a href="#">Add</a></li>
                            <li class="breadcrumb-item active">Jobs </li>
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
                                <h3 class="card-title"> Add Jobs </h3>
                            </div>
                            <form class="form-horizontal" method="post" accept="{{ url('admin/jobs/add') }}"
                                enctype="multipart/form-data">
                                {{ csrf_field() }}
                                <div class="card-body">





                                    {{-- the first spam for the red message
the secound spam that not closed any thing you write in the place of close whill appear in red mess
value = old for not rebeating the input  --}}

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Job Title <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="text" value="{{ old('job_title') }}" name="job_title"
                                                class="form-control" required placeholder="Enter Job title">
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Min Salary <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ old('min_salary') }}" name="min_salary"
                                                class="form-control" placeholder="Enter Min Salary">
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Max Salary <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ old('max_salary') }}" name="max_salary"
                                                class="form-control" required placeholder="Enter Max Salary">
                                        </div>
                                    </div>



                                    <div class="form-group row"> {{-- for make selection --}}
                                        <label class="col-sm-2 col-form-lable"> Department Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <select class="form-control" name="department_id" required>
                                                <option value=""> Select Department </option>
                                                @foreach($getDepartments as $value_department) {{-- $getDepartments is made in job controller at add function to link --}}
                                                <option value="{{ $value_department->id }}"> {{ $value_department->department_name }} </option>
                                                @endforeach
                                            </select>
                                        </div>
                                    </div>











                                </div>


                                <div class="card-footer">
                                    <a href="{{ url('admin/jobs') }}" class="btn btn-default float-left">Back</a>
                                    {{-- float for the place of the button --}}
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
