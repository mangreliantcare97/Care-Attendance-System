@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">
                    <div class="col-sm-6" style="margin-left: 450px">
                        <h1 class="m-0"> {{ $employeeName }}'s Payroll</h1>
                    </div><!-- /.col -->

                </div><!-- /.row -->
            </div><!-- /.container-fluid -->
        </div>
        <!-- /.content-header -->

        <section class="content">
            <div class="container-fluid">
                <div class="row">
                    <div class="col-md-12">
                        <div class="card card-warning">
                            <div class="card-header">
                            </div>
                            <form class="form-horizontal" method="post" action="{{ route('payroll_update',$getRecord->id) }}"
                                enctype="multipart/form-data">
                                {{ csrf_field() }}
                                <div class="card-body">



                                    {{-- the first spam for the red message
the secound spam that not closed any thing you write in the place of close whill appear in red mess
value = old for not rebeating the input  --}}








                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Basic Salary <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord-> basic_salary }}" name="basic_salary"
                                                class="form-control" placeholder="Basic Salary">
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Bonuses <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord-> bounas }}" name="bounas"
                                                class="form-control" placeholder="bounas">
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Deductions <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord-> deductions }}" name="deductions"
                                                class="form-control" placeholder="Deductions">
                                        </div>
                                    </div>


                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Taxes <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord-> taxes }}" name="taxes"
                                                class="form-control" placeholder="Taxes">
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Vacation Balance <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord-> rest_vacancy }}" name="rest_vacancy"
                                                class="form-control" >
                                        </div>
                                    </div>



                                    <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Net Pay <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="number" value="{{ $getRecord-> net_pay }}" name="net_pay"
                                                class="form-control" placeholder="Net Pay">
                                        </div>
                                    </div>


                                    {{-- <div class="form-group row">
                                        <label class="col-sm-2 col-form-lable"> Pay Date  <span style="color: red;">
                                            </span></label>
                                        <div class="col-sm-10">
                                            <input type="date" value="{{ $getRecord-> created_at }}" name="created_at"
                                                class="form-control" placeholder="Pay Date">
                                        </div>
                                    </div> --}}
















                                </div>


                                <div class="card-footer">
                                    <a href="{{ url('admin/payroll') }}" class="btn btn-default float-left">Back</a>
                                    {{-- float for the place of the button --}}
                                    <button type="submit" class="btn btn-warning float-right">Edit</button>

                                </div>
                            </form>

                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
@endsection
