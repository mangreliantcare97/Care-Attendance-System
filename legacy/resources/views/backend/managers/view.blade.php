@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 class="m-0">View Managers</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-right">
                            <li class="breadcrumb-item"><a href="#">View</a></li>
                            <li class="breadcrumb-item active">Managers </li>
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
                                <h3 class="card-title"> View Managers </h3>
                            </div>
                            <form class="form-horizontal" method="post" enctype="multipart/form-data">
                                <div class="card-body">



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> ID <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            {{ $getRecord->id }}
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Name <span style="color: red;">
                                                </span></label>
                                        <div class="col-sm-10">
                                            {{ $getRecord->name }}
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Email <span style="color: red;">
                                                </span></label>
                                        <div class="col-sm-10">
                                            {{ $getRecord->email }}
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Phone Number <span style="color: red;">
                                                </span></label>
                                        <div class="col-sm-10">
                                            {{ $getRecord->phone_number }}
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Hire Date <span style="color: red;">
                                                </span></label>
                                        <div class="col-sm-10">
                                            {{ $getRecord->hire_date }}
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Salary <span style="color: red;">
                                                </span></label>
                                        <div class="col-sm-10">
                                            {{ $getRecord->salary }}
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Commission PCT <span style="color: red;">
                                                </span></label>
                                        <div class="col-sm-10">
                                            {{ $getRecord->commission_pct }}
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Created Date <span style="color: red;">
                                                </span></label>
                                        <div class="col-sm-10">
                                            {{ date('d-m-Y  H:i A', strtotime($getRecord->created_at)) }}
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Updated Date <span style="color: red;">
                                                </span></label>
                                        <div class="col-sm-10">
                                            {{ date('d-m-Y H:i A', strtotime($getRecord->updated_at)) }}
                                        </div>
                                    </div>








                                </div>
                                    <div class="card-footer">
                                        <a href="{{ url('admin/manager') }}" class="btn btn-default float-left">Back</a>
                                        {{-- float for the place of the button --}}
                                    </div>
                                </form>
                        </div>
                    </div>
                </div>
            </div>
        </section>


                <!-- /.content-body -->






                        <!-- /.content-body -->
                    </div>
                    @endsection





