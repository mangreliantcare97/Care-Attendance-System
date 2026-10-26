@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 >Managers</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6" style="text-align: right;">
                                        <a href="{{ url('admin/manager/add') }}" class="btn btn-primary"> Add Managers</a>

                    </div><!-- /.col -->
                </div><!-- /.row -->
            </div><!-- /.container-fluid -->
        </div>
        <!-- /.content-header -->

        <section class="content">
            <div class="container-fluid">

                <div class="row">
                    <section class="col-md-12">
                        <div class="card">
                            <div class="card-header">

                           <h3 class="card-title">Search Managers</h3>

                            </div>

                            <form method="get" action="">
                                <div class="card-body">
                                    <div class="row">

                                        {{-- here the searching options --}}
                                        {{-- name and value I put the name el mktop fl database --}}
                                        {{-- md3 for the size of the label md2 small --}}
                                        <div class="form-group col-md-1">
                                            <label> ID </label>
                                            <input type="text" name="id" class="form-control" value="{{ Request()->id }}" placeholder="ID">
                                        </div>

                                        <div class="form-group col-md-2">
                                            <label> Name </label>
                                            <input type="text" value="{{ Request()->name }}" name="name" class="form-control" placeholder="Name">
                                        </div>



                                        <div class="form-group col-md-3">
                                            <button class="btn btn-primary" type="submit" style="margin-top: 30px;">
                                                Search </button>
                                                <a href="{{ url('admin/manager') }}" class="btn btn-success" style="margin-top: 30px">Reset</a>
                                        </div>


                                    </div>
                                </div>
                                    </form>
                        </div>


                     @include('_message')

                     <div class="card">
                        <div class="card-header">
                            <h3 class="card-title"> Managers List </h3>
                        </div>

                        <div class="card-body p-0">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Phone Number</th>
                                        <th>Hire Date</th>
                                    </tr>
                                </thead>


                                <tbody>
                                    @forelse ($getRecord as $value )  {{-- forelse insted of foreach it found with col spam and empty for writing not found if not found --}}
                                    <tr>
                                        <td>{{ $value->name }}</td>
                                        <td>{{ $value->email }}</td>
                                        <td>{{ $value->phone_number }}</td>
                                        <td>{{ $value->hire_date }}</td>

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
