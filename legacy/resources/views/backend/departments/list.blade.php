@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/generall.png') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 >Departments</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6" style="text-align: right;">
                                        <a href="{{ url('admin/department/add') }}" class="btn btn-primary"> Add Department</a>

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

                           <h3 class="card-title">Search Department</h3>

                            </div>

                            <form method="get" action="">
                                <div class="card-body">
                                    <div class="row">

                                        {{-- here the searching options --}}
                                        {{-- name and value I put the name el mktop fl database --}}
                                        {{-- md3 for the size of the label md2 small --}}


                                        <div class="form-group col-md-2">
                                            <label>Department Name </label>
                                            <input type="text" value="{{ Request()->department_name }}" name="department_name" class="form-control" placeholder=" Name">
                                        </div>



                                        <div class="form-group col-md-3">
                                            <button class="btn btn-primary" type="submit" style="margin-top: 30px;">
                                                Search </button>
                                                <a href="{{ url('admin/department') }}" class="btn btn-success" style="margin-top: 30px">Reset</a>
                                        </div>


                                    </div>
                                </div>
                                    </form>
                        </div>





                     @include('_message')

                     <div class="card" style="background-color: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                        <div class="card-header">
                            <h3 class="card-title"> Department List </h3>
                        </div>

                        <div class="card-body p-0">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Department Name</th>
                                        <th>Manager Name</th>
                                        <th>Location</th>
                                        <th>Action</th>{{-- buttons of crud inside it --}}
                                    </tr>
                                </thead>


                                <tbody>
                                    @forelse ($getRecord as $value )  {{-- forelse insted of foreach it found with col spam and empty for writing not found if not found --}}
                                    <tr>
                                        <td>{{ $value->department_name }}</td>
                                        <td>
                                          {{ $value->manager_name ?? 'N/A' }}<!-- Display N/A if manager is null -->
                                        </td>
                                        <td>{{ $value->location }}</td>

                                        <td>
                                            <a href="{{ url('admin/department/edit/' .$value->id) }}" class="btn btn-primary">Edit</a>
                                            <a href="{{ url('admin/department/delete/' .$value->id) }}" onclick="return confirm('Are you sure you want to delete ?')" class="btn btn-danger">Delete</a>
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
