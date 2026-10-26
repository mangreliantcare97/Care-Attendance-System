@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/generall.png') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 >Job History</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6" style="text-align: right;">
                        <form action="{{ url('admin/jobhistory_export') }}" method="get"> <!-- excel export form -->
                            <input type="hidden" name="employee_name" value="{{ Request()->employee_name }}">
                            <input type="hidden" name="job_title" value="{{ Request()->job_title }}">
                            <input type="hidden" name="start_date" value="{{ Request()->start_date }}">
                            <input type="hidden" name="end_date" value="{{ Request()->end_date }}">

                            <button type="submit" class="btn btn-success">
                                <i class="fas fa-file-excel"></i> Export
                            </button>
                        </form>
                        <br>


                    <a href="{{ url('admin/job_history/add') }}" class="btn
                    btn-primary"> Add History</a>
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

                           <h3 class="card-title">Search Job History</h3>

                            </div>

                            <form method="get" action="">
                                <div class="card-body">
                                    <div class="row">

                                        {{-- here the searching options --}}
                                        {{-- name and value I put the name el mktop fl database --}}
                                        {{-- md3 for the size of the label md2 small --}}

                                        {{-- <div class="form-group col-md-3">
                                            <label> ID </label>
                                            <input type="number" name="h_id" class="form-control" value="{{ Request()->h_id }}" placeholder="ID">
                                        </div> --}}

                                        <div class="form-group col-md-2">
                                            <label> Employee Name </label>
                                            <input type="text" value="{{ Request()->employee_name }}" name="employee_name" class="form-control" placeholder=" Name">
                                        </div>



                                        <div class="form-group col-md-3">
                                            <label> From Date (Start Date) </label>
                                            <input type="date" value="{{ Request()->start_date }}" name="start_date" class="form-control">
                                        </div>



                                        <div class="form-group col-md-2">
                                            <label> Job Title </label>
                                            <input type="text" value="{{ Request()->job_title }}" name="job_title" class="form-control" placeholder="Job Title">
                                        </div>

                                        <div class="form-group col-md-3">
                                            <button class="btn btn-primary" type="submit" style="margin-top: 30px;">
                                                Search </button>
                                                <a href="{{ url('admin/job_history') }}" class="btn btn-success" style="margin-top: 30px">Reset</a>
                                        </div>


                                      </div>
                                    </div>
                                    </form>
                        </div>


                     @include('_message')

                     <div class="card" style="background-color: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                        <div class="card-header">
                            <h3 class="card-title"> Job History List </h3>
                        </div>

                        <div class="card-body p-0">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Employee Name</th>
                                        <th>Start Date</th>
                                        <th>End Date</th>
                                        <th>Job Title</th>
                                        <th>Department Name </th>
                                        <th>Action</th>{{-- buttons of crud inside it --}}
                                    </tr>
                                </thead>
                                <tbody>
                                    @forelse ($getRecord as $value )  {{-- forelse insted of foreach it found with col spam and empty for writing not found if not found --}}
                                    <tr>
                                        <td>{{ $value->employee_name }}</td>
                                        <td>{{ $value->start_date }}</td>
                                        <td>{{ $value->end_date }}</td>

                                        <td>{{ $value->job_title }}</td>
                                        <td>{{ $value->department_name }}</td>


                                        <td>
                                            <a href="{{ url('admin/job_history/edit/' .$value->id) }}" class="btn btn-primary">Edit</a>
                                            <a href="{{ url('admin/job_history/delete/' .$value->id) }}" onclick="return confirm('Are you sure you want to delete ?')" class="btn btn-danger">Delete</a>
                                        </td>
                                 </tr>
                                 @empty
                                 <tr>
                                    <td colspan="100%"> Not Found.. </td>
                                 </tr>
                                   @endforelse
                                </tbody>
                            </table>

                            <div style="padding: 10px; float:right;">   {{-- for pagination --}}
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
