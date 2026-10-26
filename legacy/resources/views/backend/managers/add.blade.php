@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/generall.png') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 class="m-0">Managers</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-right">
                            <li class="breadcrumb-item"><a href="#">Add</a></li>
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
                                <h3 class="card-title"> Add Managers </h3>
                            </div>
                            <form class="form-horizontal" method="post" accept="{{ url('admin/manager/add') }}"
                                enctype="multipart/form-data">
                                {{ csrf_field() }}
                                <div class="card-body">





                                    {{-- the first spam for the red message
the secound spam that not closed any thing you write in the place of close whill appear in red mess
value = old for not rebeating the input  --}}

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="text" value="{{ old('name') }}" name="name"
                                                class="form-control" required placeholder="Enter  Name">
                                        </div>
                                    </div>




                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Email <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="email" value="{{ old('email') }}" name="email"
                                                class="form-control" required placeholder="Enter Email">
                                            <span style="color:red"> {{ $errors->first('email') }}
                                            </span>
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Phone Number <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ old('phone_number') }}" name="phone_number"
                                                class="form-control" placeholder="Enter Phone Number">
                                            <span style="color:red"> {{ $errors->first('phone_number') }}
                                            </span>
                                        </div>
                                    </div>





                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Hire Date <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="date" value="{{ old('hire_date') }}" name="hire_date"
                                                class="form-control" required placeholder="day/mounth/year">
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Salary <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ old('salary') }}" name="salary"
                                                class="form-control" required placeholder="Enter Salary">
                                            <span style="color:red"> {{ $errors->first('salary') }}
                                            </span>
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Commission PCT <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ old('commission_pct') }}" name="commission_pct"
                                                class="form-control" required placeholder="Enter Commission PCT">
                                            <span style="color:red"> {{ $errors->first('commission_pct') }}
                                            </span>
                                        </div>
                                    </div>







                                </div>


                                <div class="card-footer">
                                    <a href="{{ url('admin/manager') }}" class="btn btn-default float-left">Back</a>
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
