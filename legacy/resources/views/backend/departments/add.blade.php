@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img/generall.png') }}'); background-size: cover; background-position: center;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6">
                        <h1 class="m-0">Department</h1>
                    </div><!-- /.col -->
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-right">
                            <li class="breadcrumb-item"><a href="#">Add</a></li>
                            <li class="breadcrumb-item active">Department </li>
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
                                <h3 class="card-title"> Add Department </h3>
                            </div>
                            <form class="form-horizontal" method="post" accept="{{ url('admin/department/add') }}"
                                enctype="multipart/form-data">
                                {{ csrf_field() }}
                                <div class="card-body">





                                    {{-- the first spam for the red message
the secound spam that not closed any thing you write in the place of close whill appear in red mess
value = old for not rebeating the input  --}}

                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable">Department Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <input type="text" value="{{ old('department_name') }}" name="department_name"
                                                class="form-control" required placeholder="Enter Department Name">
                                        </div>
                                    </div>



                                    <div class="form-group row"> {{-- for make selection --}}
                                        <label class="col-sm-2 col-form-lable"> Manager Name <span style="color: red;">
                                                *</span></label>
                                        <div class="col-sm-10">
                                            <select class="form-control" name="manager_id" required> {{-- b7ot el esm el f database bta3t hna --}}
                                                <option value=""> Select Manager Name </option>
                                                @foreach($getManagers as $value_manager) {{-- $getManagers is made in employee controller at add function to link --}}
                                                <option value="{{ $value_manager->id }}"> {{ $value_manager->name }} </option> {{-- name of manager table --}}
                                                @endforeach
                                            </select>
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Location  <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="text" value="{{ old('location') }}" name="location"
                                                class="form-control" placeholder="Enter Location">
                                        </div>
                                    </div>

                                </div>


                                <div class="card-footer">
                                    <a href="{{ url('admin/department') }}" class="btn btn-default float-left">Back</a>
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
