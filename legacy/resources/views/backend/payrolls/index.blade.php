@extends('backend.layouts.app')
@section('content')
    <!-- Content Wrapper. Contains page content -->
    <div class="content-wrapper" style="background-image: url('{{ asset('/dist/img//payroll3.jpg') }}'); background-size: cover; background-position: center; background-attachment: fixed;">
        <!-- Content Header (Page header) -->
        <div class="content-header">
            <div class="container-fluid">
                <div class="row mb-2">



                    <div id="accordion" class="w-100">
                        <div class="card card-light">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h4 class="card-title m-0">
                                    <a class="d-block" data-toggle="collapse" href="#collapseOne" >
                                        Payroll List
                                    </a>
                                </h4>
                                <a href="{{ url('admin/payroll/add') }}" class="btn btn-primary text-white" style="margin-left: 1000px">Create Payroll</a>
                            </div>
                            <div id="collapseOne" class="collapse " data-parent="#accordion">
                                <div class="card-body">
                                    Clarification of The Rules:                                                     <br>
                                    # Bounas = Based on OverTime 1 hour = bounas 50                                 <br>
                                    # Deductions = Based on Attendance and Leaves If the leave is Early and Vacations if exceed the dayes of vacation 1 day = 200 <br>
                                    Attendance:                                                                     <br>
                                    1 => (0) Deductions if Present                                                  <br>
                                    2 => (0.05 x Basic Salary) if Late                                              <br>
                                    3 => (0.1 x Basic Salary) if Absent                                             <br>
                                    4 => (0.025 x Basic Salary) if Half Day                                         <br>
                                    Deductions = Attendance + Leave Deduction (if early) + Vacations (if exceed)    <br>
                                    # Tax = Basic / 10                                                              <br>
                                    # Total Vacation Balance = 25   (if less than 25 so you take from your balance) <br>
                                    # Net Pay = basic_salary - (taxes + deductions) + bounas
                                </div>
                            </div>
                        </div>
                    </div><!-- /.col -->
                </div><!-- /.row -->
            </div><!-- /.container-fluid -->
        </div><!-- /.content-header -->




        <form method="get" action="">
            <div class="card-body">
                <div class="row">

                    <div class="form-group col-md-2">
                        <label>Employee Name</label>
                        <input type="text" value="{{ Request::get('name') }}" name="name" class="form-control" placeholder="Enter Name" style="background-color: rgba(255, 255, 255, 0.5); color: black; border: 1px solid rgba(255, 255, 255, 0.8);">
                    </div>


                    <div class="form-group col-md-2">
                        <label>Month</label>
                        <select name="month" class="form-control" style="background-color: rgba(255, 255, 255, 0.5); border: 1px solid rgba(255, 255, 255, 0.8);">
                            <option value="">Select Month</option>
                            @for ($i = 1; $i <= 12; $i++)
                                <option value="{{ $i }}" {{ Request::get('month') == $i ? 'selected' : '' }}>{{ date('F', mktime(0, 0, 0, $i, 1)) }}</option>
                            @endfor
                        </select>
                    </div>



                    <div class="form-group col-md-2">
                        <label>Year</label>
                        <select name="year" class="form-control" style="background-color: rgba(255, 255, 255, 0.5); border: 1px solid rgba(255, 255, 255, 0.8);">
                            <option value="">Select Year</option>
                            @php
                                $currentYear = date('Y');
                                $endYear = $currentYear + 6; // Show 6 years into the future
                            @endphp
                            @for ($i = $currentYear; $i <= $endYear; $i++)
                                <option value="{{ $i }}" {{ Request::get('year') == $i ? 'selected' : '' }}>{{ $i }}</option>
                            @endfor
                        </select>
                    </div>




                    <div class="form-group col-md-6 d-flex align-items-end justify-content-between">
                        <div>
                            <button class="btn btn-primary" type="submit">Search</button>
                            <a href="{{ url('admin/payroll') }}" class="btn btn-success ml-2">Reset</a>
                        </div>
                        <a class="btn btn-success ml-auto" href="{{ url('admin/payroll_export?name='.Request::get('name').'&month='.Request::get('month').'&year='.Request::get('year')) }}">
                            <i class="fas fa-file-excel"></i> Excel
                        </a>
                        <a href="{{ route('payrolls.exportPdf', Request::all()) }}" class="btn btn-danger" style="margin-left: 10px">
                            <i class="fas fa-file-pdf"></i> PDF
                        </a>
                    </div>
                </div>
            </div>
        </form>




        @include('_message')

            <div class="card" style="background-color: rgba(255, 255, 255, 0.7); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                <div class="card-header">
                    <h3 class="card-title">Payroll List</h3>
                    <button class="btn btn-danger" id="deleteSelected" style="float: right;">Delete Selection</button>
                </div>

            <table class="table table-bordered">
                <thead>
                <tr>
                    <th><input type="checkbox" id="selectAll"></th>
                    <th>Employee ID</th>
                    <th>Employee Name</th>
                    <th>Basic Salary</th>
                    <th>Bounas</th>
                    <th>Deductions</th>
                    <th>Taxes</th>
                    <th>Vacation Balance</th>
                    <th>Net Pay</th>
                    <th>Pay Date</th>
                    <th>Month</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                @foreach($getRecord as $value)
                <tr>

                    <td><input type="checkbox" class="payrollCheckbox" value="{{ $value->id }}"></td>
                    <td>{{ $value->employee_id }}</td>
                    <td>{{ $value->name }}</td>
                    <td>{{ $value->basic_salary }}</td>
                    <td>{{ $value->bounas }}</td>
                    <td>{{ $value->deductions }}</td>
                    <td>{{ $value->taxes }}</td>
                    <td> Balance = {{ $value->rest_vacancy }} day</td>
                    <td>{{ $value->net_pay }}</td>
                    <td>{{ date('d-m-Y', strtotime($value->created_at)) }}</td>
                    <td>{{ date('m', strtotime($value->created_at)) }}</td>
                    <td>
                        <a href="{{ url('admin/payroll/edit/' . $value->id) }}" class="btn btn-warning btn-sm">Edit</a>
                        <a href="{{ url('admin/payroll/delete/' . $value->id) }}" onclick="return confirm('Are you sure you want to delete?')" class="btn btn-danger btn-sm">Delete</a>
                    </td>

                </tr>
                @endforeach
            </tbody>
        </table>




        <div style="margin-left: 1050px">
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
<script src="{{ url('dist/js/payroll.js') }}"></script>


@endsection
