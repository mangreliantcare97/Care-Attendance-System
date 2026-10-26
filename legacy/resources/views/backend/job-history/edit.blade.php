@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 class="m-0">Job History</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-right">
                            <li class="breadcrumb-item"><a href="#">Edit History</a></li>
                            <li class="breadcrumb-item active">Job History  </li>
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
                                <h3 class="card-title"> Edit Job History </h3>
                            </div>
                            <form class="form-horizontal" method="post" action="{{ route('history_update',$getRecord->id) }}"
                                enctype="multipart/form-data">
                                {{ csrf_field() }}
                                <div class="card-body">



                                    {{-- the first spam for the red message
the secound spam that not closed any thing you write in the place of close whill appear in red mess
value = old for not rebeating the input  --}}

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Employee Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="text" value="{{ $getRecord->employee_name }}" name="employee_name"
                                                class="form-control" required placeholder="Enter Employee Name">
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Start Date <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="date" value="{{ $getRecord->start_date }}" name="start_date"
                                                class="form-control" required placeholder="Enter Start Date">
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> End Date <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="date" value="{{ $getRecord->end_date }}" name="end_date"
                                                class="form-control" required placeholder="Enter End Date">
                                        </div>
                                    </div>



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
                                    <a href="{{ url('admin/job_history') }}" class="btn btn-default float-left">Back</a>
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
