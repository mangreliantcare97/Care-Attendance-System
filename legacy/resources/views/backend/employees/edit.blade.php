@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 class="m-0">Employees</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-right">
                            <li class="breadcrumb-item"><a href="#">Edit</a></li>
                            <li class="breadcrumb-item active">Employees </li>
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
                                <h3 class="card-title"> Edit Employees </h3>
                            </div>
                            <form class="form-horizontal" method="post" action="{{ route('employees_update',$getRecord->id) }}"
                                enctype="multipart/form-data">
                                {{ csrf_field() }}
                                <div class="card-body">



                                    {{-- the first spam for the red message
the secound spam that not closed any thing you write in the place of close whill appear in red mess
value = old for not rebeating the input  --}}

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> First Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="text" value="{{ $getRecord->name }}" name="name"
                                                class="form-control" required placeholder="Enter First Name">
                                        </div>
                                    </div>




                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Email <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="email" value="{{ $getRecord->email }}" name="email"
                                                class="form-control" required placeholder="Enter Email">
                                            <span style="color:red"> {{ $errors->first('email') }}
                                            </span>
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Phone Number <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord->phone_number }}" name="phone_number"
                                                class="form-control" placeholder="Enter Phone Number">
                                            <span style="color:red"> {{ $errors->first('phone_number') }}
                                            </span>
                                        </div>
                                    </div>



                                    {{-- <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Hire Date <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="date" value="{{ $getRecord->hire_date }}" name="hire_date"
                                                class="form-control" required placeholder="day/mounth/year">
                                                <span style="color:red"> {{ $errors->first('phone_number') }}
                                                </span>
                                        </div>
                                    </div> --}}



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Job Title <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <select class="form-control" name="job_id" required>
                                                @foreach($getJobs as $value_job)
                                                <option {{ ($value_job->id == $getRecord->job_id) ? 'selected' : '' }} value="{{ $value_job->id }}"> {{ $value_job->job_title }}</option>
                                                @endforeach
                                            </select>
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Salary <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord->salary }}" name="salary"
                                                class="form-control" required placeholder="Enter Salary">
                                            <span style="color:red"> {{ $errors->first('salary') }}
                                            </span>
                                        </div>
                                    </div>



                                    {{-- <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Commission PCT <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord->commission_pct }}" name="commission_pct"
                                                class="form-control" required placeholder="Enter Commission PCT">
                                            <span style="color:red"> {{ $errors->first('commission_pct') }}
                                            </span>
                                        </div>
                                    </div> --}}



                                    <div class="form-group row"> {{-- for make selection --}}
                                        <label class="col-sm-2 col-form-lable"> Manager Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <select class="form-control" name="manager_id" required>
                                                @foreach($getManagers as $value_manager)
                                                <option {{ ($value_manager->id == $getRecord->manager_id) ? 'selected' : '' }} value="{{ $value_manager->id }}"> {{ $value_manager->name }}</option> elnos al awlany fe el code da ms2ol 3n ezhar data al 2dema
                                                @endforeach
                                            </select>
                                        </div>
                                    </div>



                                    <div class="form-group row"> {{-- for make selection --}}
                                        <label class="col-sm-2 col-form-lable"> Department Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <select class="form-control" name="department_id" required>
                                                @foreach($getDepartments as $value_department)
                                                <option {{ ($value_department->id == $getRecord->department_id) ? 'selected' : '' }} value="{{ $value_department->id }}"> {{ $value_department->department_name }}</option>
                                                @endforeach
                                            </select>
                                        </div>
                                    </div>



                                </div>


                                <div class="card-footer">
                                    <a href="{{ url('admin/employees') }}" class="btn btn-default float-left">Back</a>
                                    {{-- float for the place of the button --}}
                                    <button type="submit" class="btn btn-primary float-right">Update</button>

                                </div>
                            </form>

                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
@endsection
