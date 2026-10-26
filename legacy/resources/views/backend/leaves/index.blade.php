@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/leave.jpg') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 >Leaves</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6" style="text-align: right;">

                    <a href="{{ url('admin/leaves/add') }}" class="btn
                    btn-primary"> Add Leaves</a>
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
                                            <input type="text" value="{{ Request()->name }}" name="name" class="form-control" placeholder="Enter Name">
                                        </div>

                                        <div class="form-group col-md-3">
                                            <button class="btn btn-primary" type="submit" style="margin-top: 30px;">
                                                Search </button>
                                                <a href="{{ url('admin/leaves') }}" class="btn btn-success" style="margin-top: 30px">Reset</a>
                                        </div>



                                      </div>
                                    </div>
                                    </form>
                        </div>


                     @include('_message')

                     <div class="card" style="background-color: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                        <div class="card-header">
                            <h3 class="card-title"> Leaves List </h3>
                            <button class="btn btn-danger" id="deleteSelected" style="float: right;">Delete Selection</button>
                        </div>

                        <div class="card-body p-0">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" id="selectAll"></th>
                                        <th>Employee Name</th>
                                        <th>Leave Type</th>
                                        <th>Leave Deduction</th>
                                        <th>Leave Date</th>
                                        <th>Action</th>{{-- buttons of crud inside it --}}
                                    </tr>
                                </thead>
                                <tbody>
                                    @forelse ($getRecord as $value )  {{-- forelse insted of foreach it found with col spam and empty for writing not found if not found --}}
                                    <tr>
                                        <td><input type="checkbox" class="leaveCheckbox" value="{{ $value->id }}"></td>
                                        <td>{{ $value->name }}</td>
                                        <td>{{ $value->leave_type }}</td>
                                        <td>{{ $value->leave_deduction }} LE</td>
                                        <td>{{ date('d-m-Y (h:i A)', strtotime($value->created_at)) }}</td>
                                        <td>
                                            <a href="{{ url('admin/leaves/delete/' .$value->id) }}" onclick="return confirm('Are you sure you want to delete ?')" class="btn btn-danger">Delete</a>
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



<!-- Link to the new JavaScript file -->
<script src="{{ url('dist/js/leave.js') }}"></script>

@endsection

