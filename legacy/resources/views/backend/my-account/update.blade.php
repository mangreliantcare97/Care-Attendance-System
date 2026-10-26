@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/my account.jpg') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 class="m-0">My Account Edit</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-right">
                            <li class="breadcrumb-item"><a href="#">Setting</a></li>
                            <li class="breadcrumb-item active">My Account </li>
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

                     @include('_message')

                        <div class="card card-info">
                            <div class="card-header">
                                <h3 class="card-title"> My Account </h3>
                            </div>

                            {{-- da form el saf7a bdelo url 34an a7oto fl routes get and post --}}
                            <form class="form-horizontal" method="post" action="{{ url('admin/my_account/update') }}" enctype="multipart/form-data">
                                {{ csrf_field() }}
                                <div class="card-body">





                                    {{-- the first spam for the red message
the secound spam that not closed any thing you write in the place of close whill appear in red mess
value = old for not rebeating the input  --}}

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="text" value="{{ $getRecord->name }}" name="name"
                                                class="form-control" required placeholder="Enter name">
                                                <span style="color: red;"> {{ $errors->first('name') }} </span>
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Email <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="email" value="{{ $getRecord->email }}" name="email"
                                                class="form-control" required placeholder="Enter Email">
                                                <span style="color: red;"> {{ $errors->first('email') }} </span>
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Password <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="text" value="" name="password"
                                                class="form-control"  placeholder="Enter Password">
                                                (Leave This blank if you are not changing the password)
                                        </div>
                                    </div>


                                </div>


                                <div class="card-footer">
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
