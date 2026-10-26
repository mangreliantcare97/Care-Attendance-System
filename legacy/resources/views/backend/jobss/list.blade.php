@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/generall.png') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 >Jobs</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6" style="text-align: right;">


                        <form action="{{ url('admin/jobs_export') }}" method="get">
                            <input type="hidden" name="job_title" value="{{ Request()->job_title }}">
                            <!-- Include other search parameters as hidden fields -->
                            <input type="hidden" name="start_date" value="{{ Request()->start_date }}">
                            <input type="hidden" name="end_date" value="{{ Request()->end_date }}">

                            <button type="submit" class="btn btn-success">
                                <i class="fas fa-file-excel"></i> Export
                            </button>
                        </form>
                    <br>

                    <a href="{{ url('admin/jobs/add') }}" class="btn
                    btn-primary"> Add Jobs</a>
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

                           <h3 class="card-title">Search Jobs</h3>

                            </div>

                            <form method="get" action="">
                                <div class="card-body">
                                    <div class="row">

                                        {{-- here the searching options --}}
                                        {{-- name and value I put the name el mktop fl database --}}
                                        {{-- md3 for the size of the label md2 small --}}

                                        {{-- <div class="form-group col-md-3">
                                            <label> ID </label>
                                            <input type="text" name="id" class="form-control" value="{{ Request()->id }}" placeholder="ID">
                                        </div> --}}

                                        <div class="form-group col-md-2">
                                            <label> Job Title </label>
                                            <input type="text" value="{{ Request()->job_title }}" name="job_title" class="form-control" placeholder="Name">
                                        </div>

                                        {{-- <div class="form-group col-md-2">
                                            <label> Min Salary </label>
                                            <input type="number" value="{{ Request()->min_salary }}" name="min_salary" class="form-control" placeholder="Min Salary">
                                        </div>

                                        <div class="form-group col-md-3">
                                            <label> Max Salary </label>
                                            <input type="number" value="{{ Request()->max_salary }}" name="max_salary" class="form-control" placeholder="Max Salary">
                                        </div> --}}




                                        <div class="form-group col-md-3">
                                            <button class="btn btn-primary" type="submit" style="margin-top: 30px;">
                                                Search </button>
                                                <a href="{{ url('admin/jobs') }}" class="btn btn-success" style="margin-top: 30px">Reset</a>
                                        </div>


                                    </div>
                                </div>
                                    </form>
                        </div>


                     @include('_message')

                     <div class="card" style="background-color: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                        <div class="card-header">
                            <h3 class="card-title"> Jobs List </h3>
                        </div>

                        <div class="card-body p-0">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Job Title</th>
                                        <th>Min Salary</th>
                                        <th>Max Salary</th>
                                        <th>Department Name</th>
                                        <th>Created At </th>
                                        <th>Action</th>{{-- buttons of crud inside it --}}
                                    </tr>
                                </thead>


                                <tbody>
                                    @forelse ($getRecord as $value )  {{-- forelse insted of foreach it found with col spam and empty for writing not found if not found --}}
                                    <tr>
                                        <td>{{ $value->id }}</td>
                                        <td>{{ $value->job_title }}</td>
                                        <td>{{ $value->min_salary }}</td>
                                        <td>{{ $value->max_salary }}</td>
                                        <td>{{ $value->department_name ?? 'N/A' }}</td>
                                        <td>{{ $value->created_at }}</td>

                                        <td>
                                            <a href="{{ url('admin/jobs/view/' .$value->id) }}" class="btn btn-info">View</a> {{-- . $value->id .  >>>  --}}
                                            <a href="{{ url('admin/jobs/edit/' .$value->id) }}" class="btn btn-primary">Edit</a>
                                            <a href="{{ url('admin/jobs/delete/' .$value->id) }}" onclick="return confirm('Are you sure you want to delete ?')" class="btn btn-danger">Delete</a>
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
