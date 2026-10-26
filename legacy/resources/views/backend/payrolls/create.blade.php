@extends('backend.layouts.app')
@section('content')

  {{-- mina payroll css --}}
  <link rel="stylesheet" href="{{ url('dist/css/payrollcreate.css') }}">


<!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img//payroll3.jpg') }}'); background-size: cover; background-position: center; background-attachment: fixed;">
    <!-- Content Header (Page header) -->
    <div class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <div class="card-header">
                        <h1 class="card-title">Create Payroll</h1>
                    </div>
                </div>
            </div>

            <form class="form-horizontal" method="post" action="{{ url('admin/payroll/add') }}" enctype="multipart/form-data">
                {{ csrf_field() }}

                <div class="form-group row">
                    <label class="col-sm-3 col-form-label">Start Date<span style="color: red;">*</span></label>
                    <div class="col-sm-9">
                        <input type="date" name="start_date" class="form-control" required>
                    </div>
                </div>

                <div class="form-group row">
                    <label class="col-sm-3 col-form-label">End Date<span style="color: red;">*</span></label>
                    <div class="col-sm-9">
                        <input type="date" name="end_date" class="form-control" required>
                    </div>
                </div>

                <div class="form-group row">
                    <label class="col-sm-3 col-form-label">Employee Name<span style="color: red;">*</span></label>
                    <div class="col-sm-9">
                        <div class="checkbox-box">
                            <div class="checkbox-item">
                                <input type="checkbox" id="select-all">
                                <label for="select-all">Select All</label>
                            </div>

                            @foreach ($getEmployees as $value_employee)
                                <div class="checkbox-item">
                                    <input type="checkbox" name="employee_ids[]" value="{{ $value_employee->id }}"
                                        id="employee-{{ $value_employee->id }}" class="employee-checkbox">
                                    <label for="employee-{{ $value_employee->id }}">{{ $value_employee->name }}</label>
                                </div>
                            @endforeach
                        </div>
                    </div>
                </div>

                <div class="card">
                    <button type="submit" class="btn btn-white float-right" style="background-color: #ffc852;">Calculate Payroll</button>
                    <a href="{{ url('admin/payroll') }}" class="btn btn-white float-left">Back</a>
                </div>
            </form>
        </div>
    </div>
</div>
@endsection

<!-- Link to the new JavaScript file -->
<script src="{{ url('dist/js/payrollcreate.js') }}"></script>
